package services

import (
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/pkg/database"
)

// ESC/POS Command Constants
var (
	EscInit     = []byte{0x1B, 0x40}        // Initialize printer (ESC @)
	EscBoldOn   = []byte{0x1B, 0x45, 0x01}  // Bold on (ESC E 1)
	EscBoldOff  = []byte{0x1B, 0x45, 0x00}  // Bold off (ESC E 0)
	EscDoubleOn = []byte{0x1B, 0x45, 0x01}  // Double size fallback: use Bold only (ESC E 1) to avoid firmware crash
	EscNormal   = []byte{0x1B, 0x45, 0x00}  // Reset styles: Bold off (ESC E 0)
	EscAlignL   = []byte{0x1B, 0x61, 0x00}  // Align left (ESC a 0)
	EscAlignC   = []byte{0x1B, 0x61, 0x01}  // Align center (ESC a 1)
	EscAlignR   = []byte{0x1B, 0x61, 0x02}  // Align right (ESC a 2)
	EscCut      = []byte{0x1D, 0x56, 0x41, 0x03} // Paper Cut (GS V A 3)
)

// Helper functions for ESC/POS printing sanitization and routing

func getPhysicalKey(p *domain.Impressora) string {
	if p.Tipo == "usb" {
		if p.Dispositivo == "" {
			return fmt.Sprintf("invalid-usb-%d", p.ID)
		}
		return "usb:" + p.Dispositivo
	}
	if p.IP == "" || p.Porta == 0 {
		return fmt.Sprintf("invalid-tcp-%d", p.ID)
	}
	return fmt.Sprintf("tcp:%s:%d", p.IP, p.Porta)
}

func sanitizeASCII(s string) string {
	replacer := strings.NewReplacer(
		"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
		"é", "e", "è", "e", "ê", "e", "ë", "e",
		"í", "i", "ì", "i", "î", "i", "ï", "i",
		"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
		"ú", "u", "ù", "u", "û", "u", "ü", "u",
		"ç", "c",
		"Á", "A", "À", "A", "Â", "A", "Ã", "A", "Ä", "A",
		"É", "E", "È", "E", "Ê", "E", "Ë", "E",
		"Í", "I", "Ì", "I", "Î", "I", "Ï", "I",
		"Ó", "O", "Ò", "O", "Ô", "O", "Õ", "O", "Ö", "O",
		"Ú", "U", "Ù", "U", "Û", "U", "Ü", "U",
		"Ç", "C",
	)
	return replacer.Replace(s)
}

func truncateString(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) > maxLen {
		return string(runes[:maxLen])
	}
	return s
}

// ConsolidatedItem represents a consolidated product row for customer checkout
type ConsolidatedItem struct {
	ProdutoNome   string
	Quantidade    int
	PrecoUnitario float64
	Observacao    string
}

func consolidateItems(items []domain.ItemPedido) []ConsolidatedItem {
	var result []ConsolidatedItem
	type keyStruct struct {
		name  string
		price float64
	}
	keyMap := make(map[keyStruct]int)

	for _, item := range items {
		k := keyStruct{name: item.ProdutoNome, price: item.PrecoUnitario}
		if idx, exists := keyMap[k]; exists {
			result[idx].Quantidade += item.Quantidade
			if item.Observacao != "" {
				if result[idx].Observacao == "" {
					result[idx].Observacao = item.Observacao
				} else {
					result[idx].Observacao += "; " + item.Observacao
				}
			}
		} else {
			result = append(result, ConsolidatedItem{
				ProdutoNome:   item.ProdutoNome,
				Quantidade:    item.Quantidade,
				PrecoUnitario: item.PrecoUnitario,
				Observacao:    item.Observacao,
			})
			keyMap[k] = len(result) - 1
		}
	}
	return result
}

// PrintOrderReceipt routes order items to printers based on sector
func PrintOrderReceipt(tenantID uint, order domain.Pedido) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database client not initialized")
	}

	// Fetch all sectors for print configuration
	var sectors []domain.Setor
	if err := db.Where("tenant_id = ?", tenantID).Find(&sectors).Error; err != nil {
		return fmt.Errorf("failed to fetch sectors: %v", err)
	}

	sectorNames := make(map[uint]string)
	sectorsSemImpressao := make(map[uint]bool)
	for _, s := range sectors {
		sectorNames[s.ID] = s.Nome
		sectorsSemImpressao[s.ID] = s.SemImpressao
	}

	// Fetch all printers for this tenant
	var printers []domain.Impressora
	if err := db.Where("tenant_id = ?", tenantID).Find(&printers).Error; err != nil {
		return fmt.Errorf("failed to fetch printers: %v", err)
	}

	if len(printers) == 0 {
		log.Printf("[PRINTER] No printers configured for Tenant %d. Mocking printing to console.", tenantID)
		mockPrintToConsole(order, nil)
		return nil
	}

	// Map Sector ID to Printer
	sectorToPrinter := make(map[uint]*domain.Impressora)
	for i := range printers {
		sectorToPrinter[printers[i].SetorID] = &printers[i]
	}

	// Group order items by physical printer destination to avoid printing multiple cut tickets on the same printer
	itemsByDest := make(map[string][]domain.ItemPedido)
	destToPrinter := make(map[string]*domain.Impressora)

	for _, item := range order.Itens {
		// If this sector has disabled printing, skip routing it to any printer (including fallback)
		if sectorsSemImpressao[item.SetorID] {
			log.Printf("[PRINTER] Skipping printing for item '%s' (Sector %d has printing disabled).", item.ProdutoNome, item.SetorID)
			continue
		}

		p, exists := sectorToPrinter[item.SetorID]
		if !exists && len(printers) > 0 {
			// Fallback: use first available printer if sector has no dedicated printer
			p = &printers[0]
			exists = true
		}
		if exists {
			key := getPhysicalKey(p)
			itemsByDest[key] = append(itemsByDest[key], item)
			destToPrinter[key] = p
		} else {
			itemsByDest[""] = append(itemsByDest[""], item)
		}
	}

	for destKey, items := range itemsByDest {
		if destKey == "" {
			log.Printf("[PRINTER] No printer matched for some items. Fallback to console print.")
			mockPrintToConsole(order, items)
			continue
		}

		p := destToPrinter[destKey]
		payload := buildESCPOSPayload(order, items, p.Nome, sectorNames)

		err := sendToPrinter(p, payload)
		if err != nil {
			log.Printf("[PRINTER ERROR] Failed to send print job to %s: %v. Fallback to console and local Caixa printer.", p.Nome, err)
			mockPrintToConsole(order, items)
			
			// Find Caixa printer for physical fallback print
			var caixaPrinter *domain.Impressora
			for i := range printers {
				// Match by name or common sector (Caixa)
				if strings.ToLower(printers[i].Nome) == "caixa" || printers[i].SetorID == 3 {
					caixaPrinter = &printers[i]
					break
				}
			}
			
			if caixaPrinter != nil && caixaPrinter.ID != p.ID {
				log.Printf("[PRINTER FALLBACK] Redirecting failed %s ticket to %s printer", p.Nome, caixaPrinter.Nome)
				fallbackPayload := buildESCPOSPayload(order, items, fmt.Sprintf("%s (FALHA DE REDE)", p.Nome), sectorNames)
				if fallbackErr := sendToPrinter(caixaPrinter, fallbackPayload); fallbackErr == nil {
					log.Printf("[PRINTER FALLBACK SUCCESS] Printed %s sector items on %s due to original printer failure", p.Nome, caixaPrinter.Nome)
				} else {
					log.Printf("[PRINTER FALLBACK ERROR] Failed fallback printing to %s: %v", caixaPrinter.Nome, fallbackErr)
				}
			}
		} else {
			log.Printf("[PRINTER SUCCESS] Printed %d items on %s", len(items), p.Nome)
		}
	}

	return nil
}

// buildESCPOSPayload constructs the binary payload with printer commands
func buildESCPOSPayload(order domain.Pedido, items []domain.ItemPedido, printerName string, sectorNames map[uint]string) []byte {
	var data []byte

	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	data = append(data, []byte(fmt.Sprintf("PEDIDO #%d\n", order.ID))...)
	data = append(data, EscNormal...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Impressora: %s\n", sanitizeASCII(printerName)))...)
	data = append(data, []byte(fmt.Sprintf("Data: %s\n", order.CreatedAt.Format("02/01/2006 15:04:05")))...)
	
	if order.MesaID != nil {
		data = append(data, EscBoldOn...)
		data = append(data, []byte(fmt.Sprintf("MESA: %d\n", *order.MesaID))...)
		data = append(data, EscBoldOff...)
	}
	if order.ComandaID != nil {
		data = append(data, []byte(fmt.Sprintf("Comanda: %d\n", *order.ComandaID))...)
	}
	
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignL...)

	for _, item := range items {
		secName := sectorNames[item.SetorID]
		name := sanitizeASCII(item.ProdutoNome)
		name = truncateString(name, 22)
		var line string
		if secName != "" {
			secName = sanitizeASCII(secName)
			secName = truncateString(secName, 10)
			line = fmt.Sprintf("%dx %-22s (%s)\n", item.Quantidade, name, secName)
		} else {
			line = fmt.Sprintf("%dx %-30s\n", item.Quantidade, name)
		}
		data = append(data, []byte(line)...)
		if item.Observacao != "" {
			obs := sanitizeASCII(item.Observacao)
			data = append(data, []byte(fmt.Sprintf("  Obs: %s\n", obs))...)
		}
	}
	
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	return data
}

// sendToPrinter dispatches print data to a printer based on its type (tcp or usb)
func sendToPrinter(p *domain.Impressora, data []byte) error {
	if p.Tipo == "usb" {
		if p.Dispositivo == "" {
			return fmt.Errorf("USB printer '%s' has no device path configured", p.Nome)
		}
		return sendUSBData(p.Dispositivo, data)
	}
	// Default: TCP/Network
	return sendTCPData(p.IP, p.Porta, data)
}

// TestPrinter is the public exported wrapper for sending arbitrary ESC/POS data to a printer.
// Used by handlers for test-page requests.
func TestPrinter(p *domain.Impressora, data []byte) error {
	return sendToPrinter(p, data)
}

// sendUSBData writes raw bytes directly to a USB printer device file
func sendUSBData(devicePath string, data []byte) error {
	f, err := os.OpenFile(devicePath, os.O_WRONLY, 0666)
	if err != nil {
		// Build a helpful hint listing available printer devices
		hint := detectAvailablePrinterDevices()
		if hint != "" {
			return fmt.Errorf("device USB '%s' não encontrado. Devices disponíveis: %s", devicePath, hint)
		}
		return fmt.Errorf("device USB '%s' não encontrado. Nenhum device de impressora detectado em /dev/usb/, /dev/lp* ou /dev/ttyUSB*. Verifique se a impressora está conectada", devicePath)
	}
	defer f.Close()

	log.Printf("[USB WRITE] device: %s, len: %d, content: %q", devicePath, len(data), data)
	_, err = f.Write(data)
	if err != nil {
		return fmt.Errorf("erro ao escrever no device USB %s: %w", devicePath, err)
	}
	
	// Flush kernel buffers
	_ = f.Sync()
	
	// Give the USB printer hardware enough time to read from the buffer before closing
	time.Sleep(250 * time.Millisecond)
	
	return nil
}

// detectAvailablePrinterDevices scans common Linux paths for printer devices
func detectAvailablePrinterDevices() string {
	devices := DetectUSBDevices()
	if len(devices) == 0 {
		return ""
	}
	result := []string{}
	for _, d := range devices {
		result = append(result, d.Path)
	}
	return strings.Join(result, ", ")
}

// USBDevice represents a detected printer device with metadata
type USBDevice struct {
	Path       string `json:"path"`        // e.g. /dev/usb/lp0
	VendorID   string `json:"vendor_id"`   // e.g. 20d1
	ProductID  string `json:"product_id"`  // e.g. 7008
	Model      string `json:"model"`       // e.g. ELGIN i9
	Accessible bool   `json:"accessible"`  // whether the process can open it
}

// Known ESC/POS printer USB IDs (vendor:product)
var knownPrinters = map[string]string{
	"20d1:7008": "ELGIN i9",
	"20d1:7009": "ELGIN i9 Full",
	"20d1:7010": "ELGIN i8",
	"20d1:7011": "ELGIN i7",
	"20d1:700a": "ELGIN B1",
	"04b8:0202": "Epson TM-T20",
	"04b8:0e03": "Epson TM-T88V",
	"0519:0002": "Star TSP100",
	"0dd4:0186": "Custom TG2480H",
	"1fc9:2016": "Daruma DR800",
	"20d1:2014": "SWEDA SI-300S",
	"0416:5011": "Bixolon SRP-350",
	"1504:0006": "Zebra ZD420",
}

// DetectUSBDevices scans the system for printer USB devices.
// Checks /dev/usb/lp*, /dev/lp*, /dev/ttyUSB*, /dev/ttyACM*
// Also queries sysfs to identify known printer models even when usblp module is not loaded.
func DetectUSBDevices() []USBDevice {
	found := []USBDevice{}

	// 1. Scan standard device file paths
	patterns := []string{
		"/dev/usb/lp*",
		"/dev/lp*",
		"/dev/ttyUSB*",
		"/dev/ttyACM*",
	}
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, path := range matches {
			accessible := canOpenDevice(path)
			found = append(found, USBDevice{
				Path:       path,
				Model:      "Impressora USB",
				Accessible: accessible,
			})
		}
	}

	// 2. Scan sysfs for USB devices matching known printer IDs
	// This works even when usblp module is NOT loaded
	sysUSBBase := "/sys/bus/usb/devices"
	entries, err := os.ReadDir(sysUSBBase)
	if err == nil {
		for _, entry := range entries {
			devPath := filepath.Join(sysUSBBase, entry.Name())

			vendorBytes, err1 := os.ReadFile(filepath.Join(devPath, "idVendor"))
			productBytes, err2 := os.ReadFile(filepath.Join(devPath, "idProduct"))
			if err1 != nil || err2 != nil {
				continue
			}

			vendorID := strings.TrimSpace(string(vendorBytes))
			productID := strings.TrimSpace(string(productBytes))
			key := vendorID + ":" + productID

			model, isKnown := knownPrinters[key]
			if !isKnown {
				// Check if it's a USB printer class (bDeviceClass=0 with bInterfaceClass=7)
				classBytes, _ := os.ReadFile(filepath.Join(devPath, "bDeviceClass"))
				ifClassBytes, _ := os.ReadFile(filepath.Join(devPath, "bInterfaceClass"))
				deviceClass := strings.TrimSpace(string(classBytes))
				ifClass := strings.TrimSpace(string(ifClassBytes))
				if deviceClass != "00" && ifClass != "07" {
					continue
				}
				model = "Impressora USB (" + vendorID + ":" + productID + ")"
			}

			// Try to find the corresponding /dev/usb/lp* node via sysfs link
			devNode := findDevNodeForUSBDevice(devPath)

			// Skip if already found via glob
			alreadyFound := false
			for _, f := range found {
				if f.Path == devNode {
					// Update with model info
					f.Model = model
					f.VendorID = vendorID
					f.ProductID = productID
					alreadyFound = true
					break
				}
			}

			if !alreadyFound {
				accessible := false
				if devNode != "" {
					accessible = canOpenDevice(devNode)
				}
				found = append(found, USBDevice{
					Path:       devNode,
					VendorID:   vendorID,
					ProductID:  productID,
					Model:      model,
					Accessible: accessible,
				})
			}
		}
	}

	return found
}

// canOpenDevice checks if the current process can open a device for writing
func canOpenDevice(path string) bool {
	if path == "" {
		return false
	}
	f, err := os.OpenFile(path, os.O_WRONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return false
	}
	f.Close()
	return true
}

// findDevNodeForUSBDevice tries to find the /dev/usb/lp* node for a sysfs USB device entry
func findDevNodeForUSBDevice(sysDevPath string) string {
	// Walk subdirectories looking for a "dev" file (contains major:minor)
	entries, err := os.ReadDir(sysDevPath)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		// USB printer interface dir typically named like "1-1.2:1.0"
		subPath := filepath.Join(sysDevPath, e.Name())
		devFile := filepath.Join(subPath, "dev")
		if _, err := os.Stat(devFile); err == nil {
			// Try to find matching /dev node
			lpMatches, _ := filepath.Glob("/dev/usb/lp*")
			for _, lp := range lpMatches {
				return lp
			}
			lpMatches, _ = filepath.Glob("/dev/lp*")
			for _, lp := range lpMatches {
				return lp
			}
		}
	}
	return ""
}

// sendTCPData writes raw bytes to a network socket
func sendTCPData(ip string, port int, data []byte) error {
	address := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("tcp", address, 3*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()

	_, err = conn.Write(data)
	return err
}

// mockPrintToConsole prints formatted receipt text to server logs for debugging
func mockPrintToConsole(order domain.Pedido, items []domain.ItemPedido) {
	fmt.Println("\n================= MOCK IMPRESSAO ESC/POS =================")
	fmt.Printf("PEDIDO: #%d\n", order.ID)
	fmt.Printf("DATA: %s\n", order.CreatedAt.Format("02/01/2006 15:04:05"))
	if order.MesaID != nil {
		fmt.Printf("MESA: %d\n", *order.MesaID)
	}
	if order.ComandaID != nil {
		fmt.Printf("COMANDA ID: %d\n", *order.ComandaID)
	}
	fmt.Println("----------------------------------------------------------")

	targetItems := items
	if len(targetItems) == 0 {
		targetItems = order.Itens
	}

	for _, item := range targetItems {
		fmt.Printf("%dx %-35s (Setor: %d)\n", item.Quantidade, item.ProdutoNome, item.SetorID)
		if item.Observacao != "" {
			fmt.Printf("   * Obs: %s\n", item.Observacao)
		}
	}
	fmt.Println("----------------------------------------------------------")
	fmt.Println("==========================================================\n")
}

// PrintPreCloseReceipt prints the bill summary for table closure request
func PrintPreCloseReceipt(tenantID uint, mesaNumero int, orders []domain.Pedido) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database client not initialized")
	}

	var printers []domain.Impressora
	if err := db.Where("tenant_id = ?", tenantID).Find(&printers).Error; err != nil {
		return fmt.Errorf("failed to fetch printers: %v", err)
	}

	// Find cashier printer, or default to first
	var matchedPrinter *domain.Impressora
	for _, p := range printers {
		if p.Tipo == "usb" && p.Dispositivo != "" {
			matchedPrinter = &p
			break
		}
		if p.IP != "" && p.Porta != 0 {
			matchedPrinter = &p
			break
		}
	}

	// Accumulate all items and totals
	var total float64
	var allItems []domain.ItemPedido
	for _, ord := range orders {
		total += ord.Total
		allItems = append(allItems, ord.Itens...)
	}

	// Consolidate identical items
	consolidated := consolidateItems(allItems)

	if matchedPrinter == nil {
		log.Printf("[PRINTER] No printer configured. Mocking pre-close receipt for Mesa %d to console.", mesaNumero)
		mockPrintPreCloseToConsole(mesaNumero, allItems, total)
		return nil
	}

	// Retrieve company name
	var company domain.Empresa
	companyName := ""
	if err := db.First(&company, tenantID).Error; err == nil && company.Nome != "" {
		companyName = company.Nome
	}

	// Build payload
	var data []byte
	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	if companyName != "" {
		data = append(data, []byte(fmt.Sprintf("%s\n", strings.ToUpper(sanitizeASCII(companyName))))...)
	}
	data = append(data, []byte("CONTA PREVIA\n")...)
	data = append(data, EscNormal...)
	data = append(data, []byte(fmt.Sprintf("MESA: %d\n", mesaNumero))...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Data: %s\n", time.Now().Format("02/01/2006 15:04:05")))...)
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignL...)

	for _, item := range consolidated {
		name := sanitizeASCII(item.ProdutoNome)
		name = truncateString(name, 22)
		line := fmt.Sprintf("%dx %-22s R$ %6.2f\n", item.Quantidade, name, item.PrecoUnitario*float64(item.Quantidade))
		data = append(data, []byte(line)...)
	}

	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignR...)
	data = append(data, EscBoldOn...)
	data = append(data, []byte(fmt.Sprintf("TOTAL GERAL: R$ %.2f\n", total))...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	// Send to printer (USB or TCP)
	err := sendToPrinter(matchedPrinter, data)
	if err != nil {
		log.Printf("[PRINTER ERROR] Failed to send pre-close receipt: %v", err)
		mockPrintPreCloseToConsole(mesaNumero, allItems, total)
	}

	return nil
}

func mockPrintPreCloseToConsole(mesaNumero int, items []domain.ItemPedido, total float64) {
	fmt.Println("\n================ MOCK PRE-FECHAMENTO MESA ================")
	fmt.Printf("MESA: %d\n", mesaNumero)
	fmt.Printf("DATA: %s\n", time.Now().Format("02/01/2006 15:04:05"))
	fmt.Println("----------------------------------------------------------")
	for _, item := range items {
		fmt.Printf("%dx %-35s R$ %6.2f\n", item.Quantidade, item.ProdutoNome, item.PrecoUnitario*float64(item.Quantidade))
	}
	fmt.Println("----------------------------------------------------------")
	fmt.Printf("TOTAL ACUMULADO: R$ %.2f\n", total)
	fmt.Println("==========================================================\n")
}

// PrintPaymentReceipt prints a customer sale receipt on the cashier printer
func PrintPaymentReceipt(tenantID uint, paymentID uint) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database client not initialized")
	}

	var payment domain.Pagamento
	if err := db.Where("tenant_id = ? AND id = ?", tenantID, paymentID).First(&payment).Error; err != nil {
		return fmt.Errorf("payment not found: %w", err)
	}

	// Fetch all printers
	var printers []domain.Impressora
	if err := db.Where("tenant_id = ?", tenantID).Find(&printers).Error; err != nil {
		return fmt.Errorf("failed to fetch printers: %w", err)
	}

	// Find Caixa printer
	var matchedPrinter *domain.Impressora
	var caixaSector domain.Setor
	if err := db.Where("tenant_id = ? AND nome = ?", tenantID, "Caixa").First(&caixaSector).Error; err == nil {
		for _, p := range printers {
			if p.SetorID == caixaSector.ID {
				matchedPrinter = &p
				break
			}
		}
	}

	// Fallback to any USB printer (since Elgin i9 is configured via USB)
	if matchedPrinter == nil {
		for _, p := range printers {
			if p.Tipo == "usb" && p.Dispositivo != "" {
				matchedPrinter = &p
				break
			}
		}
	}

	// Fallback to first printer
	if matchedPrinter == nil && len(printers) > 0 {
		matchedPrinter = &printers[0]
	}

	// Retrieve items list and context
	var items []domain.ItemPedido
	var description = "COMPROVANTE DE VENDA"
	var identifier = ""

	if payment.PedidoID != nil {
		var order domain.Pedido
		if err := db.Preload("Itens").Where("tenant_id = ? AND id = ?", tenantID, *payment.PedidoID).First(&order).Error; err == nil {
			if order.MesaID != nil {
				identifier = fmt.Sprintf("MESA: %d", *order.MesaID)
				
				// Find all active orders for this table (not yet delivered/entregue)
				var activeOrders []domain.Pedido
				db.Preload("Itens").Where("tenant_id = ? AND mesa_id = ? AND status != ?", tenantID, *order.MesaID, "entregue").Find(&activeOrders)
				
				for _, ord := range activeOrders {
					items = append(items, ord.Itens...)
				}
				
				// If no active orders found (fallback), just use current order items
				if len(items) == 0 {
					items = order.Itens
				}
			} else {
				// Standalone order (balcão/direct sales)
				items = order.Itens
				if order.ComandaID != nil {
					identifier = fmt.Sprintf("COMANDA: %d", *order.ComandaID)
				} else {
					identifier = "VENDA DIRETA"
				}
			}
			description = fmt.Sprintf("COMPROVANTE PEDIDO #%d", order.ID)
		}
	} else if payment.ComandaID != nil {
		var comanda domain.Comanda
		if err := db.Where("tenant_id = ? AND id = ?", tenantID, *payment.ComandaID).First(&comanda).Error; err == nil {
			identifier = fmt.Sprintf("COMANDA: %s", comanda.Numero)
			if comanda.MesaID != nil {
				identifier += fmt.Sprintf(" (MESA %d)", *comanda.MesaID)
			}
			description = "COMPROVANTE DE VENDA"

			// Find all items of orders associated with this comanda
			var orders []domain.Pedido
			db.Preload("Itens").Where("tenant_id = ? AND comanda_id = ?", tenantID, comanda.ID).Find(&orders)
			for _, ord := range orders {
				items = append(items, ord.Itens...)
			}
		}
	}

	// Consolidate duplicate items
	consolidated := consolidateItems(items)

	if matchedPrinter == nil {
		log.Printf("[PRINTER] No printer configured. Mocking payment receipt to console.")
		mockPrintPaymentToConsole(description, identifier, items, payment)
		return nil
	}

	// Retrieve company name
	var company domain.Empresa
	companyName := "RESTAURANTE"
	if err := db.First(&company, tenantID).Error; err == nil && company.Nome != "" {
		companyName = company.Nome
	}

	// Build payload
	var data []byte
	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	data = append(data, []byte(fmt.Sprintf("%s\n", strings.ToUpper(sanitizeASCII(companyName))))...)
	data = append(data, EscNormal...)
	data = append(data, []byte(fmt.Sprintf("%s\n", sanitizeASCII(description)))...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Data: %s\n", payment.CreatedAt.Format("02/01/2006 15:04:05")))...)
	if identifier != "" {
		data = append(data, []byte(fmt.Sprintf("%s\n", sanitizeASCII(identifier)))...)
	}
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignL...)

	var subtotal float64
	for _, item := range consolidated {
		name := sanitizeASCII(item.ProdutoNome)
		name = truncateString(name, 22)
		line := fmt.Sprintf("%dx %-22s R$ %6.2f\n", item.Quantidade, name, item.PrecoUnitario*float64(item.Quantidade))
		data = append(data, []byte(line)...)
		subtotal += item.PrecoUnitario * float64(item.Quantidade)
	}

	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignR...)
	data = append(data, []byte(fmt.Sprintf("SUBTOTAL: R$ %.2f\n", subtotal))...)
	data = append(data, EscBoldOn...)
	
	// Translate payment method to nice PT-BR name
	metodoStr := strings.ToUpper(payment.Metodo)
	switch payment.Metodo {
	case "pix":
		metodoStr = "PIX"
	case "cartao_credito":
		metodoStr = "CARTAO CREDITO"
	case "cartao_debito":
		metodoStr = "CARTAO DEBITO"
	case "dinheiro":
		metodoStr = "DINHEIRO"
	}
	
	data = append(data, []byte(fmt.Sprintf("PAGO VIA %s: R$ %.2f\n", metodoStr, payment.Valor))...)
	data = append(data, EscBoldOff...)
	
	if payment.Metodo == "dinheiro" && payment.Valor > subtotal {
		change := payment.Valor - subtotal
		data = append(data, []byte(fmt.Sprintf("TROCO: R$ %.2f\n", change))...)
	}
	
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignC...)
	data = append(data, []byte("Obrigado pela preferencia!\n")...)
	data = append(data, []byte("Volte sempre!\n")...)
	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	// Send to printer
	err := sendToPrinter(matchedPrinter, data)
	if err != nil {
		log.Printf("[PRINTER ERROR] Failed to send payment receipt: %v", err)
		mockPrintPaymentToConsole(description, identifier, items, payment)
		return fmt.Errorf("failed to print payment receipt: %w", err)
	}

	return nil
}

func mockPrintPaymentToConsole(desc string, iden string, items []domain.ItemPedido, pay domain.Pagamento) {
	fmt.Printf("\n================ %s ================\n", desc)
	if iden != "" {
		fmt.Printf("IDENTIFICADOR: %s\n", iden)
	}
	fmt.Printf("DATA: %s\n", pay.CreatedAt.Format("02/01/2006 15:04:05"))
	fmt.Println("----------------------------------------------------------")
	var subtotal float64
	for _, item := range items {
		fmt.Printf("%dx %-35s R$ %6.2f\n", item.Quantidade, item.ProdutoNome, item.PrecoUnitario*float64(item.Quantidade))
		subtotal += item.PrecoUnitario * float64(item.Quantidade)
	}
	fmt.Println("----------------------------------------------------------")
	fmt.Printf("SUBTOTAL: R$ %.2f\n", subtotal)
	fmt.Printf("PAGO VIA %s: R$ %.2f\n", pay.Metodo, pay.Valor)
	if pay.Metodo == "dinheiro" && pay.Valor > subtotal {
		fmt.Printf("TROCO: R$ %.2f\n", pay.Valor-subtotal)
	}
	fmt.Println("==========================================================\n")
}

func getCaixaPrinter(tenantID uint) (*domain.Impressora, error) {
	db := database.GetDB()
	var printers []domain.Impressora
	if err := db.Where("tenant_id = ?", tenantID).Find(&printers).Error; err != nil {
		return nil, err
	}

	var matchedPrinter *domain.Impressora
	var caixaSector domain.Setor
	if err := db.Where("tenant_id = ? AND LOWER(nome) = ?", tenantID, "caixa").First(&caixaSector).Error; err == nil {
		for i := range printers {
			if printers[i].SetorID == caixaSector.ID {
				matchedPrinter = &printers[i]
				break
			}
		}
	}

	if matchedPrinter == nil {
		for i := range printers {
			if printers[i].Tipo == "usb" && printers[i].Dispositivo != "" {
				matchedPrinter = &printers[i]
				break
			}
		}
	}

	if matchedPrinter == nil && len(printers) > 0 {
		matchedPrinter = &printers[0]
	}

	return matchedPrinter, nil
}

// CaixaMetodoTotal helper type for PrintCaixaFechamento
type CaixaMetodoTotal struct {
	Metodo string
	Total  float64
}

// PrintCaixaAbertura prints the opening receipt of a cash register session
func PrintCaixaAbertura(tenantID uint, turnoID uint) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database client not initialized")
	}

	var turno domain.CaixaTurno
	if err := db.Where("tenant_id = ? AND id = ?", tenantID, turnoID).First(&turno).Error; err != nil {
		return fmt.Errorf("turno not found: %w", err)
	}

	var user domain.Usuario
	if err := db.Where("tenant_id = ? AND id = ?", tenantID, turno.UsuarioID).First(&user).Error; err != nil {
		log.Printf("[PRINTER] Operator details not found for userID %d", turno.UsuarioID)
	}

	var company domain.Empresa
	companyName := "RESTAURANTE"
	if err := db.First(&company, tenantID).Error; err == nil && company.Nome != "" {
		companyName = company.Nome
	}

	matchedPrinter, err := getCaixaPrinter(tenantID)
	if err != nil {
		return fmt.Errorf("failed to get caixa printer: %w", err)
	}

	// Build receipt
	var data []byte
	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	data = append(data, []byte(fmt.Sprintf("%s\n", strings.ToUpper(sanitizeASCII(companyName))))...)
	data = append(data, EscNormal...)
	data = append(data, []byte("ABERTURA DE CAIXA\n")...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Turno ID: #%d\n", turno.ID))...)
	data = append(data, []byte(fmt.Sprintf("Data: %s\n", turno.AbertoEm.Format("02/01/2006 15:04:05")))...)
	if user.Nome != "" {
		data = append(data, []byte(fmt.Sprintf("Operador: %s\n", sanitizeASCII(user.Nome)))...)
	}
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignL...)
	data = append(data, EscBoldOn...)
	data = append(data, []byte(fmt.Sprintf("VALOR INICIAL: R$ %.2f\n", turno.ValorInicial))...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	if matchedPrinter == nil {
		log.Printf("[PRINTER] No printer configured. Mocking caixa abertura receipt to console.")
		mockPrintCaixaAberturaToConsole(companyName, turno, user.Nome)
		return nil
	}

	err = sendToPrinter(matchedPrinter, data)
	if err != nil {
		log.Printf("[PRINTER ERROR] Failed to send caixa abertura receipt: %v", err)
		mockPrintCaixaAberturaToConsole(companyName, turno, user.Nome)
	}

	return nil
}

func mockPrintCaixaAberturaToConsole(companyName string, turno domain.CaixaTurno, operatorName string) {
	fmt.Println("\n================ MOCK ABERTURA DE CAIXA ================")
	fmt.Printf("EMPRESA: %s\n", companyName)
	fmt.Printf("TURNO ID: #%d\n", turno.ID)
	fmt.Printf("DATA: %s\n", turno.AbertoEm.Format("02/01/2006 15:04:05"))
	fmt.Printf("OPERADOR: %s\n", operatorName)
	fmt.Println("----------------------------------------------------------")
	fmt.Printf("VALOR INICIAL: R$ %.2f\n", turno.ValorInicial)
	fmt.Println("==========================================================\n")
}

// PrintCaixaFechamento prints the complete closing receipt of a cash register session
func PrintCaixaFechamento(tenantID uint, turnoID uint) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database client not initialized")
	}

	var turno domain.CaixaTurno
	if err := db.Where("tenant_id = ? AND id = ?", tenantID, turnoID).First(&turno).Error; err != nil {
		return fmt.Errorf("turno not found: %w", err)
	}

	var user domain.Usuario
	if err := db.Where("tenant_id = ? AND id = ?", tenantID, turno.UsuarioID).First(&user).Error; err != nil {
		log.Printf("[PRINTER] Operator details not found for userID %d", turno.UsuarioID)
	}

	var company domain.Empresa
	companyName := "RESTAURANTE"
	if err := db.First(&company, tenantID).Error; err == nil && company.Nome != "" {
		companyName = company.Nome
	}

	matchedPrinter, err := getCaixaPrinter(tenantID)
	if err != nil {
		return fmt.Errorf("failed to get caixa printer: %w", err)
	}

	// Fetch information identical to HandleGetCaixaRelatorio
	var movimentacoes []domain.CaixaMovimentacao
	db.Where("caixa_turno_id = ?", turno.ID).Find(&movimentacoes)

	totalSangrias := 0.0
	totalSuprimentos := 0.0
	for _, mov := range movimentacoes {
		if mov.Tipo == "sangria" {
			totalSangrias += mov.Valor
		} else if mov.Tipo == "suprimento" {
			totalSuprimentos += mov.Valor
		}
	}

	var totalVendas float64
	queryVendas := db.Model(&domain.Pedido{}).Where("tenant_id = ? AND status IN ('concluido', 'pago', 'entregue') AND updated_at >= ?", tenantID, turno.AbertoEm)
	if turno.FechadoEm != nil {
		queryVendas = queryVendas.Where("updated_at <= ?", *turno.FechadoEm)
	}
	queryVendas.Select("COALESCE(SUM(total), 0)").Scan(&totalVendas)

	var vendasPorMetodo []CaixaMetodoTotal
	queryPagamentos := db.Model(&domain.Pagamento{}).
		Select("metodo, COALESCE(SUM(valor), 0) as total").
		Where("tenant_id = ? AND status = 'aprovado' AND updated_at >= ?", tenantID, turno.AbertoEm)

	if turno.FechadoEm != nil {
		queryPagamentos = queryPagamentos.Where("updated_at <= ?", *turno.FechadoEm)
	}
	queryPagamentos.Group("metodo").Scan(&vendasPorMetodo)

	saldoCalculado := turno.ValorInicial + totalVendas + totalSuprimentos - totalSangrias
	diferenca := turno.ValorFinal - saldoCalculado

	// Build receipt
	var data []byte
	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	data = append(data, []byte(fmt.Sprintf("%s\n", strings.ToUpper(sanitizeASCII(companyName))))...)
	data = append(data, EscNormal...)
	data = append(data, []byte("FECHAMENTO DE CAIXA\n")...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Turno ID: #%d\n", turno.ID))...)
	data = append(data, []byte(fmt.Sprintf("Abertura: %s\n", turno.AbertoEm.Format("02/01/2006 15:04:05")))...)
	if turno.FechadoEm != nil {
		data = append(data, []byte(fmt.Sprintf("Fechamento: %s\n", turno.FechadoEm.Format("02/01/2006 15:04:05")))...)
	}
	if user.Nome != "" {
		data = append(data, []byte(fmt.Sprintf("Operador: %s\n", sanitizeASCII(user.Nome)))...)
	}
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignL...)
	data = append(data, []byte(fmt.Sprintf("Fundo Inicial (Troco):    R$ %7.2f\n", turno.ValorInicial))...)
	data = append(data, []byte(fmt.Sprintf("Total de Vendas (+):      R$ %7.2f\n", totalVendas))...)
	data = append(data, []byte(fmt.Sprintf("Total Suprimentos (+):    R$ %7.2f\n", totalSuprimentos))...)
	data = append(data, []byte(fmt.Sprintf("Total Sangrias (-):       R$ %7.2f\n", totalSangrias))...)
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscBoldOn...)
	data = append(data, []byte(fmt.Sprintf("SALDO ESPERADO (CALC):    R$ %7.2f\n", saldoCalculado))...)
	data = append(data, []byte(fmt.Sprintf("VALOR INFORMADO:          R$ %7.2f\n", turno.ValorFinal))...)

	// Print discrepancy/diferenca
	if diferenca == 0 {
		data = append(data, []byte("DIFERENCA:                R$    0.00 (OK)\n")...)
	} else if diferenca > 0 {
		data = append(data, []byte(fmt.Sprintf("DIFERENCA (SOBRA):        R$ %7.2f\n", diferenca))...)
	} else {
		data = append(data, []byte(fmt.Sprintf("DIFERENCA (FALTA):        R$ %7.2f\n", diferenca))...)
	}
	data = append(data, EscBoldOff...)
	data = append(data, []byte("------------------------------------------\n")...)

	// Sales by method
	if len(vendasPorMetodo) > 0 {
		data = append(data, EscBoldOn...)
		data = append(data, []byte("VENDAS POR MEIO DE PAGAMENTO:\n")...)
		data = append(data, EscBoldOff...)
		for _, v := range vendasPorMetodo {
			metodoStr := strings.ToUpper(v.Metodo)
			switch v.Metodo {
			case "pix":
				metodoStr = "PIX"
			case "cartao_credito":
				metodoStr = "CARTAO CREDITO"
			case "cartao_debito":
				metodoStr = "CARTAO DEBITO"
			case "dinheiro":
				metodoStr = "DINHEIRO"
			}
			data = append(data, []byte(fmt.Sprintf("- %-22s R$ %7.2f\n", metodoStr, v.Total))...)
		}
		data = append(data, []byte("------------------------------------------\n")...)
	}

	// Details of sangria and suprimentos
	if len(movimentacoes) > 0 {
		data = append(data, EscBoldOn...)
		data = append(data, []byte("MOVIMENTACOES DO CAIXA:\n")...)
		data = append(data, EscBoldOff...)
		for _, m := range movimentacoes {
			tipoStr := "SUPRIMENTO"
			if m.Tipo == "sangria" {
				tipoStr = "SANGRIA"
			}
			motivoStr := sanitizeASCII(m.Motivo)
			if len(motivoStr) > 20 {
				motivoStr = motivoStr[:20]
			}
			data = append(data, []byte(fmt.Sprintf("- %-10s %-18s R$ %7.2f\n", tipoStr, motivoStr, m.Valor))...)
		}
		data = append(data, []byte("------------------------------------------\n")...)
	}

	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	if matchedPrinter == nil {
		log.Printf("[PRINTER] No printer configured. Mocking caixa fechamento receipt to console.")
		mockPrintCaixaFechamentoToConsole(companyName, turno, user.Nome, totalVendas, totalSuprimentos, totalSangrias, saldoCalculado, diferenca, vendasPorMetodo, movimentacoes)
		return nil
	}

	err = sendToPrinter(matchedPrinter, data)
	if err != nil {
		log.Printf("[PRINTER ERROR] Failed to send caixa fechamento receipt: %v", err)
		mockPrintCaixaFechamentoToConsole(companyName, turno, user.Nome, totalVendas, totalSuprimentos, totalSangrias, saldoCalculado, diferenca, vendasPorMetodo, movimentacoes)
	}

	return nil
}

func mockPrintCaixaFechamentoToConsole(
	companyName string,
	turno domain.CaixaTurno,
	operatorName string,
	totalVendas float64,
	totalSuprimentos float64,
	totalSangrias float64,
	saldoCalculado float64,
	diferenca float64,
	vendasPorMetodo []CaixaMetodoTotal,
	movimentacoes []domain.CaixaMovimentacao,
) {
	fmt.Println("\n================ MOCK FECHAMENTO DE CAIXA ================")
	fmt.Printf("EMPRESA: %s\n", companyName)
	fmt.Printf("TURNO ID: #%d\n", turno.ID)
	fmt.Printf("DATA ABERTURA: %s\n", turno.AbertoEm.Format("02/01/2006 15:04:05"))
	if turno.FechadoEm != nil {
		fmt.Printf("DATA FECHAMENTO: %s\n", turno.FechadoEm.Format("02/01/2006 15:04:05"))
	}
	fmt.Printf("OPERADOR: %s\n", operatorName)
	fmt.Println("----------------------------------------------------------")
	fmt.Printf("VALOR INICIAL: R$ %.2f\n", turno.ValorInicial)
	fmt.Printf("TOTAL VENDAS: R$ %.2f\n", totalVendas)
	fmt.Printf("TOTAL SUPRIMENTOS: R$ %.2f\n", totalSuprimentos)
	fmt.Printf("TOTAL SANGRIAS: R$ %.2f\n", totalSangrias)
	fmt.Println("----------------------------------------------------------")
	fmt.Printf("SALDO ESPERADO: R$ %.2f\n", saldoCalculado)
	fmt.Printf("VALOR INFORMADO: R$ %.2f\n", turno.ValorFinal)
	fmt.Printf("DIFERENÇA: R$ %.2f\n", diferenca)
	fmt.Println("----------------------------------------------------------")
	if len(vendasPorMetodo) > 0 {
		fmt.Println("VENDAS POR METODO:")
		for _, v := range vendasPorMetodo {
			fmt.Printf("- %s: R$ %.2f\n", v.Metodo, v.Total)
		}
	}
	if len(movimentacoes) > 0 {
		fmt.Println("MOVIMENTACOES:")
		for _, m := range movimentacoes {
			fmt.Printf("- %s (%s): R$ %.2f\n", m.Tipo, m.Motivo, m.Valor)
		}
	}
	fmt.Println("==========================================================\n")
}

