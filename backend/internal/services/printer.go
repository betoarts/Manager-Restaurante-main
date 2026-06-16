package services

import (
	"fmt"
	"log"
	"net"
	"time"

	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/pkg/database"
)

// ESC/POS Command Constants
var (
	EscInit     = []byte{0x1B, 0x40}        // Initialize printer
	EscBoldOn   = []byte{0x1B, 0x45, 0x01}  // Bold on
	EscBoldOff  = []byte{0x1B, 0x45, 0x00}  // Bold off
	EscDoubleOn = []byte{0x1D, 0x21, 0x11}  // Double height & width
	EscNormal   = []byte{0x1D, 0x21, 0x00}  // Normal font size
	EscAlignL   = []byte{0x1B, 0x61, 0x00}  // Align left
	EscAlignC   = []byte{0x1B, 0x61, 0x01}  // Align center
	EscAlignR   = []byte{0x1B, 0x61, 0x02}  // Align right
	EscCut      = []byte{0x1D, 0x56, 0x41, 0x03} // Paper Cut
)

// PrintOrderReceipt routes order items to printers based on sector
func PrintOrderReceipt(tenantID uint, order domain.Pedido) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database client not initialized")
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

	// Group order items by SectorID
	itemsBySector := make(map[uint][]domain.ItemPedido)
	for _, item := range order.Itens {
		itemsBySector[item.SetorID] = append(itemsBySector[item.SetorID], item)
	}

	// Route items to printer matching each sector
	for sectorID, items := range itemsBySector {
		var matchedPrinter *domain.Impressora
		for _, p := range printers {
			if p.SetorID == sectorID {
				matchedPrinter = &p
				break
			}
		}

		if matchedPrinter == nil {
			log.Printf("[PRINTER] No printer matched for Sector %d (Tenant %d). Fallback to console print.", sectorID, tenantID)
			mockPrintToConsole(order, items)
			continue
		}

		// Generate ESC/POS byte array for this printer
		payload := buildESCPOSPayload(order, items, matchedPrinter.Nome)

		// Send to printer
		err := sendTCPData(matchedPrinter.IP, matchedPrinter.Porta, payload)
		if err != nil {
			log.Printf("[PRINTER ERROR] Failed to send print job to %s (%s:%d): %v. Printing content to console log for debug:", 
				matchedPrinter.Nome, matchedPrinter.IP, matchedPrinter.Porta, err)
			mockPrintToConsole(order, items)
		} else {
			log.Printf("[PRINTER SUCCESS] Printed %d items on %s (%s:%d)", len(items), matchedPrinter.Nome, matchedPrinter.IP, matchedPrinter.Porta)
		}
	}

	return nil
}

// buildESCPOSPayload constructs the binary payload with printer commands
func buildESCPOSPayload(order domain.Pedido, items []domain.ItemPedido, printerName string) []byte {
	var data []byte

	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	data = append(data, []byte(fmt.Sprintf("PEDIDO #%d\n", order.ID))...)
	data = append(data, EscNormal...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Impressora: %s\n", printerName))...)
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
		line := fmt.Sprintf("%dx %-30s\n", item.Quantidade, item.ProdutoNome)
		data = append(data, []byte(line)...)
		if item.Observacao != "" {
			data = append(data, []byte(fmt.Sprintf("  Obs: %s\n", item.Observacao))...)
		}
	}
	
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	return data
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

	if matchedPrinter == nil {
		log.Printf("[PRINTER] No printer configured. Mocking pre-close receipt for Mesa %d to console.", mesaNumero)
		mockPrintPreCloseToConsole(mesaNumero, allItems, total)
		return nil
	}

	// Build payload
	var data []byte
	data = append(data, EscInit...)
	data = append(data, EscAlignC...)
	data = append(data, EscBoldOn...)
	data = append(data, EscDoubleOn...)
	data = append(data, []byte("CONTA PREVIA\n")...)
	data = append(data, EscNormal...)
	data = append(data, []byte(fmt.Sprintf("MESA: %d\n", mesaNumero))...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte(fmt.Sprintf("Data: %s\n", time.Now().Format("02/01/2006 15:04:05")))...)
	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignL...)

	for _, item := range allItems {
		line := fmt.Sprintf("%dx %-25s R$ %6.2f\n", item.Quantidade, item.ProdutoNome, item.PrecoUnitario*float64(item.Quantidade))
		data = append(data, []byte(line)...)
	}

	data = append(data, []byte("------------------------------------------\n")...)
	data = append(data, EscAlignR...)
	data = append(data, EscBoldOn...)
	data = append(data, []byte(fmt.Sprintf("TOTAL GERAL: R$ %.2f\n", total))...)
	data = append(data, EscBoldOff...)
	data = append(data, []byte("\n\n\n")...)
	data = append(data, EscCut...)

	// Send to printer
	err := sendTCPData(matchedPrinter.IP, matchedPrinter.Porta, data)
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
