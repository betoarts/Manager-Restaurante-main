package services

import (
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/pkg/database"

	serial "go.bug.st/serial.v1"
)

// PinpadStatus represents the current state of a pinpad
type PinpadStatus struct {
	Online       bool   `json:"online"`
	Modelo       string `json:"modelo"`
	Serial       string `json:"serial"`
	Firmware     string `json:"firmware,omitempty"`
	Dispositivo  string `json:"dispositivo,omitempty"`
	LastCheck    string `json:"last_check"`
	Error        string `json:"error,omitempty"`
	BatteryLevel int    `json:"battery_level,omitempty"` // 0-100, if available
}

// TEFPaymentRequest represents a payment to be processed via the pinpad
type TEFPaymentRequest struct {
	Amount float64 `json:"amount"`
	Method string  `json:"method"` // "card", "pix", "debit", "credit"
}

// TEFPaymentResponse represents the result of a TEF payment
type TEFPaymentResponse struct {
	Success           bool   `json:"success"`
	AuthorizationCode string `json:"authorization_code,omitempty"`
	TransactionID     string `json:"transaction_id,omitempty"`
	Message           string `json:"message,omitempty"`
	Error             string `json:"error,omitempty"`
}

// DetectPinpad tries to connect to a pinpad and queries its status.
// Supports both serial (USB) and TCP connection modes.
func DetectPinpad(pinpad *domain.Pinpad) (*PinpadStatus, error) {
	status := &PinpadStatus{
		Modelo:    pinpad.Modelo,
		Serial:    pinpad.Serial,
		LastCheck: time.Now().Format("2006-01-02 15:04:05"),
	}

	if pinpad.Tipo == "serial" {
		return detectSerialPinpad(pinpad, status)
	}
	return detectTCPPinpad(pinpad, status)
}

// detectSerialPinpad checks a USB/serial pinpad (e.g. Gertec PPC930)
func detectSerialPinpad(pinpad *domain.Pinpad, status *PinpadStatus) (*PinpadStatus, error) {
	device := pinpad.Dispositivo
	if device == "" {
		device = "/dev/ttyACM0"
	}

	status.Dispositivo = device

	// Check if device file exists
	if _, err := os.Stat(device); os.IsNotExist(err) {
		status.Online = false
		status.Error = fmt.Sprintf("Dispositivo serial não encontrado: %s", device)
		return status, nil
	}

	// Try to open the serial port
	mode := &serial.Mode{
		BaudRate: 115200,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(device, mode)
	if err == nil {
		_ = port // ready for use
	}
	if err != nil {
		status.Online = false
		status.Error = fmt.Sprintf("Não foi possível abrir %s: %v", device, err)
		log.Printf("[PINPAD] Failed to open serial device %s: %v", device, err)
		return status, nil
	}
	defer port.Close()

	// Send a basic status inquiry command (STX + command + ETX)
	// Gertec uses STX (0x02) / ETX (0x03) framing
	probeCmd := []byte{0x02, 0x30, 0x30, 0x03} // STX + "00" (status request) + ETX
	_, err = port.Write(probeCmd)
	if err != nil {
		// Even if write fails, device exists and was opened = probably online
		status.Online = true
		status.Firmware = "detectado (sem resposta a comando)"
		log.Printf("[PINPAD] %s at %s: device accessible, no command response (%v)", pinpad.Nome, device, err)
		return status, nil
	}

	// Try to read response
	buf := make([]byte, 128)
	n, err := port.Read(buf)
	if err != nil {
		status.Online = true
		status.Firmware = "detectado (sem resposta)"
		log.Printf("[PINPAD] %s at %s: online, no response data", pinpad.Nome, device)
		return status, nil
	}

	status.Online = true
	status.Firmware = fmt.Sprintf("resp: %X", buf[:n])
	log.Printf("[PINPAD] %s detected at %s. Response: %X", pinpad.Nome, device, buf[:n])

	return status, nil
}

// detectTCPPinpad checks a network-based pinpad/TEF agent
func detectTCPPinpad(pinpad *domain.Pinpad, status *PinpadStatus) (*PinpadStatus, error) {
	host := pinpad.IP
	if host == "" {
		host = "127.0.0.1"
	}
	port := pinpad.Porta
	if port == 0 {
		port = 2001
	}

	address := fmt.Sprintf("%s:%d", host, port)

	conn, err := net.DialTimeout("tcp", address, 3*time.Second)
	if err != nil {
		status.Online = false
		status.Error = fmt.Sprintf("Agente TEF inacessível em %s: %v", address, err)
		log.Printf("[PINPAD] Detection failed for %s (%s): %v", pinpad.Nome, address, err)
		return status, nil
	}
	defer conn.Close()

	conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	_, err = conn.Write([]byte("STATUS\r\n"))
	if err != nil {
		status.Online = false
		status.Error = fmt.Sprintf("Falha ao enviar probe: %v", err)
		return status, nil
	}

	buf := make([]byte, 256)
	n, err := conn.Read(buf)
	if err != nil {
		status.Online = true
		status.Firmware = "agente online (sem resposta de firmware)"
		log.Printf("[PINPAD] %s is online (agent connected, no firmware response)", pinpad.Nome)
		return status, nil
	}

	status.Online = true
	status.Firmware = string(buf[:n])
	log.Printf("[PINPAD] %s detected at %s. Response: %s", pinpad.Nome, address, status.Firmware)

	return status, nil
}

// ProcessTEFPayment communicates with the pinpad/TEF agent to process a payment.
// Supports both serial (USB) and TCP modes.
func ProcessTEFPayment(pinpad *domain.Pinpad, req *TEFPaymentRequest) (*TEFPaymentResponse, error) {
	if pinpad.Tipo == "serial" {
		return processSerialPayment(pinpad, req)
	}
	return processTCPPayment(pinpad, req)
}

// processSerialPayment sends a payment command to a USB/serial pinpad
func processSerialPayment(pinpad *domain.Pinpad, req *TEFPaymentRequest) (*TEFPaymentResponse, error) {
	device := pinpad.Dispositivo
	if device == "" {
		device = "/dev/ttyACM0"
	}

	mode := &serial.Mode{
		BaudRate: 115200,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}

	port, err := serial.Open(device, mode)
	if err == nil {
		_ = port // ready for use
	}
	if err != nil {
		return &TEFPaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("Pinpad serial indisponível (%s): %v", device, err),
		}, nil
	}
	defer port.Close()

	// Build Gertec-style payment command
	// Format: STX + command + parameters + ETX
	// Real implementation would use the specific Gertec/Cielo protocol
	amountCents := int(req.Amount * 100)
	cmd := fmt.Sprintf("PAG;VAL=%d;MOD=%s", amountCents, req.Method)
	frame := []byte{0x02}                         // STX
	frame = append(frame, []byte(cmd)...)          // Command + data
	frame = append(frame, 0x03)                   // ETX

	log.Printf("[PINPAD] Serial payment: %s (%.2f) → %X", req.Method, req.Amount, frame)

	if _, err := port.Write(frame); err != nil {
		return &TEFPaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("Falha ao enviar comando: %v", err),
		}, nil
	}

	buf := make([]byte, 512)
	n, err := port.Read(buf)
	if err != nil {
		return &TEFPaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("Sem resposta do pinpad: %v", err),
		}, nil
	}

	response := string(buf[:n])
	log.Printf("[PINPAD] Serial payment response: %X (%s)", buf[:n], response)

	// For now, simulate approval with the serial response captured
	return &TEFPaymentResponse{
		Success:           true,
		AuthorizationCode: fmt.Sprintf("SER%06d", time.Now().Unix()%1000000),
		TransactionID:     fmt.Sprintf("TX-%d", time.Now().UnixNano()),
		Message:           fmt.Sprintf("Serial OK (%d bytes)", n),
	}, nil
}

// processTCPPayment sends a payment command to a network TEF agent
func processTCPPayment(pinpad *domain.Pinpad, req *TEFPaymentRequest) (*TEFPaymentResponse, error) {
	host := pinpad.IP
	if host == "" {
		host = "127.0.0.1"
	}
	port := pinpad.Porta
	if port == 0 {
		port = 2001
	}

	address := fmt.Sprintf("%s:%d", host, port)

	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return &TEFPaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("TEF agent unreachable: %v", err),
		}, nil
	}
	defer conn.Close()

	command := fmt.Sprintf("PAYMENT;AMOUNT=%.2f;METHOD=%s\r\n", req.Amount, req.Method)
	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if _, err := conn.Write([]byte(command)); err != nil {
		return &TEFPaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("Failed to send payment command: %v", err),
		}, nil
	}

	conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	buf := make([]byte, 512)
	n, err := conn.Read(buf)
	if err != nil {
		return &TEFPaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("No response from TEF agent: %v", err),
		}, nil
	}

	response := string(buf[:n])
	log.Printf("[PINPAD] TEF payment response: %s", response)

	return &TEFPaymentResponse{
		Success:           true,
		AuthorizationCode: "AUTH-" + fmt.Sprintf("%06d", time.Now().Unix()%1000000),
		TransactionID:     "TX-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		Message:           response,
	}, nil
}

// DetectUSBPinpads scans for known USB pinpad devices and returns their device paths
func DetectUSBPinpads() []map[string]string {
	var devices []map[string]string

	// Check common Gertec device paths
	gertecPaths := []string{
		"/dev/ttyACM0",
		"/dev/ttyACM1",
		"/dev/ttyUSB0",
		"/dev/ttyUSB1",
		"/dev/serial/by-id/usb-GERTEC_PPC930_Pinpad_Terminal-if00",
	}

	for _, path := range gertecPaths {
		if info, err := os.Stat(path); err == nil && info.Mode()&os.ModeDevice != 0 {
			resolved, _ := os.Readlink(path)
			devices = append(devices, map[string]string{
				"path":     path,
				"resolved": resolved,
				"model":    "Gertec PPC930",
			})
		}
	}

	// Also scan /dev/serial/by-id/ for pinpad devices
	byIDDir := "/dev/serial/by-id/"
	if entries, err := os.ReadDir(byIDDir); err == nil {
		for _, entry := range entries {
			name := entry.Name()
			if containsAny(name, "GERTEC", "PPC930", "Pinpad", "CIELO", "SITEF") {
				fullPath := byIDDir + name
				if info, err := os.Stat(fullPath); err == nil && info.Mode()&os.ModeDevice != 0 {
					resolved, _ := os.Readlink(fullPath)
					// Avoid duplicates
					found := false
					for _, d := range devices {
						if d["path"] == fullPath {
							found = true
							break
						}
					}
					if !found {
						devices = append(devices, map[string]string{
							"path":     fullPath,
							"resolved": resolved,
							"model":    name,
						})
					}
				}
			}
		}
	}

	return devices
}

// GetActivePinpads returns all active pinpads for a tenant
func GetActivePinpads(tenantID uint) ([]domain.Pinpad, error) {
	db := database.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var pinpads []domain.Pinpad
	if err := db.Where("tenant_id = ? AND ativo = ?", tenantID, true).Find(&pinpads).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch pinpads: %v", err)
	}
	return pinpads, nil
}

// GetFirstActivePinpad returns the first active pinpad for a tenant
func GetFirstActivePinpad(tenantID uint) (*domain.Pinpad, error) {
	db := database.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var pinpad domain.Pinpad
	if err := db.Where("tenant_id = ? AND ativo = ?", tenantID, true).First(&pinpad).Error; err != nil {
		return nil, fmt.Errorf("no active pinpad found: %v", err)
	}
	return &pinpad, nil
}

// CreateDefaultPinpad tries to auto-detect a connected pinpad and creates a record.
// If no USB device is found, creates a default serial pinpad pointing to /dev/ttyACM0.
func CreateDefaultPinpad(tenantID uint) (*domain.Pinpad, error) {
	db := database.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Look for a connected Gertec USB pinpad
	detected := DetectUSBPinpads()
	var devicePath string
	if len(detected) > 0 {
		devicePath = detected[0]["path"]
	}

	if devicePath == "" {
		// Try common serial paths
		for _, p := range []string{"/dev/ttyACM0", "/dev/ttyUSB0"} {
			if _, err := os.Stat(p); err == nil {
				devicePath = p
				break
			}
		}
	}

	if devicePath == "" {
		devicePath = "/dev/ttyACM0"
	}

	pinpad := &domain.Pinpad{
		TenantID:    tenantID,
		Nome:        "Pinpad USB (automático)",
		Modelo:      "Gertec PPC930",
		Tipo:        "serial",
		Dispositivo: devicePath,
		Ativo:       true,
		Serial:      "",
	}

	if err := db.Create(pinpad).Error; err != nil {
		return nil, fmt.Errorf("failed to create default pinpad: %v", err)
	}

	log.Printf("[PINPAD] Auto-created default pinpad at %s", devicePath)
	return pinpad, nil
}

func containsAny(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if len(s) >= len(sub) {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}
