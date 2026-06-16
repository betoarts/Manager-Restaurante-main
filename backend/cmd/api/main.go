package main

import (
	"log"
	"os"

	"manager-restaurant/backend/internal/handlers"
	ws "manager-restaurant/backend/internal/websocket"
	"manager-restaurant/backend/pkg/database"
	"manager-restaurant/backend/pkg/middleware"
	"manager-restaurant/backend/pkg/redis"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	log.Println("Starting Restaurant Manager ERP/PDV Backend Server...")

	// 1. Connect to PostgreSQL
	dbConn := database.ConnectPostgres()
	database.AutoMigrate(dbConn)
	database.SeedData(dbConn)

	// 2. Connect to Redis
	redisClient := redis.ConnectRedis()

	// 3. Start WebSocket Hub
	hub := ws.NewHub(redisClient)
	hub.Run()
	log.Println("WebSocket Hub initialized.")

	// 4. Initialize Fiber App
	app := fiber.New(fiber.Config{
		AppName: "Manager Restaurante Server",
	})

	// 5. Global Middlewares
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
	}))

	// 6. Routes Setup
	api := app.Group("/api")

	// Public Auth Route
	auth := api.Group("/auth")
	auth.Post("/login", handlers.HandleLogin)

	// Protected Routes (requires JWT auth)
	protected := api.Group("", middleware.RequireAuth)

	// Profile & Settings
	protected.Get("/auth/profile", handlers.HandleGetProfile)
	protected.Put("/auth/tenant", handlers.HandleUpdateTenantSettings)

	// Tables
	protected.Get("/tables", handlers.HandleGetTables)
	protected.Post("/tables", handlers.HandleCreateTable)
	protected.Get("/tables/:id/orders", handlers.HandleGetTableOrders)
	protected.Put("/tables/:id", handlers.HandleUpdateTable)
	protected.Delete("/tables/:id", handlers.HandleDeleteTable)
	protected.Post("/tables/transfer", handlers.HandleTransferTable)
	protected.Post("/tables/close/:id", handlers.HandleCloseTable)
	protected.Post("/tables/checkout/:id", handlers.HandleCheckoutTable)

	// Users Management
	protected.Get("/users", handlers.HandleGetUsers)
	protected.Post("/users", handlers.HandleCreateUser)
	protected.Put("/users/:id", handlers.HandleUpdateUser)
	protected.Delete("/users/:id", handlers.HandleDeleteUser)

	// Products
	protected.Get("/products", handlers.HandleGetProducts)
	protected.Post("/products", handlers.HandleCreateProduct)
	protected.Put("/products/:id", handlers.HandleUpdateProduct)
	protected.Delete("/products/:id", handlers.HandleDeleteProduct)

	// Categories
	protected.Get("/categories", handlers.HandleGetCategories)
	protected.Post("/categories", handlers.HandleCreateCategory)
	protected.Put("/categories/:id", handlers.HandleUpdateCategory)
	protected.Delete("/categories/:id", handlers.HandleDeleteCategory)

	// Orders & KDS
	protected.Post("/orders", handlers.HandleCreateOrder)
	protected.Get("/orders", handlers.HandleGetOrders)
	protected.Put("/orders/:id", handlers.HandleUpdateOrderStatus)
	protected.Post("/orders/:id/cancel", handlers.HandleCancelOrder)
	protected.Get("/kds", handlers.HandleGetKDS)
	protected.Get("/setores", handlers.HandleGetSetores)

	// Payments
	protected.Post("/payments", handlers.HandleProcessPayment)
	protected.Post("/tef/payment", handlers.HandleProcessTEFPayment)

	// Pinpads (TEF/Cielo terminals)
	protected.Get("/pinpads", handlers.HandleGetPinpads)
	protected.Post("/pinpads", handlers.HandleCreatePinpad)
	protected.Put("/pinpads/:id", handlers.HandleUpdatePinpad)
	protected.Delete("/pinpads/:id", handlers.HandleDeletePinpad)
	protected.Get("/pinpads/:id/detect", handlers.HandleDetectPinpad)

	// Dashboard/Analytics
	protected.Get("/dashboard/stats", handlers.HandleGetDashboardStats)

	// Stock
	protected.Get("/stock", handlers.HandleGetStock)
	protected.Put("/stock/:id", handlers.HandleAdjustStock)
	protected.Post("/stock/:id/entry", handlers.HandleEntryStock)

	// Ficha Tecnica
	protected.Get("/fichas-tecnicas/produto/:id", handlers.HandleGetFichaTecnicaByProduto)
	protected.Post("/fichas-tecnicas", handlers.HandleCreateFichaTecnicaItem)
	protected.Delete("/fichas-tecnicas/:id", handlers.HandleDeleteFichaTecnicaItem)

	// ERP: Fornecedores
	protected.Get("/fornecedores", handlers.HandleGetFornecedores)
	protected.Post("/fornecedores", handlers.HandleCreateFornecedor)
	protected.Put("/fornecedores/:id", handlers.HandleUpdateFornecedor)
	protected.Delete("/fornecedores/:id", handlers.HandleDeleteFornecedor)

	// ERP: Compras (Notas Fiscais)
	protected.Get("/compras", handlers.HandleGetCompras)
	protected.Post("/compras", handlers.HandleCreateCompra)

	// Financeiro (Contas a Pagar e Extrato)
	protected.Get("/contas-pagar", handlers.HandleGetContasPagar)
	protected.Post("/contas-pagar", handlers.HandleCreateContaPagar)
	protected.Put("/contas-pagar/:id/pay", handlers.HandlePayContaPagar)
	protected.Get("/financeiro/extrato", handlers.HandleGetExtrato)

	// Configurações e Permissões
	protected.Get("/permissoes", handlers.HandleGetPermissoes)
	protected.Post("/permissoes", handlers.HandleSavePermissoes)

	// PDV: Caixa (Turnos e Movimentações)
	protected.Get("/caixa/status", handlers.HandleGetCaixaStatus)
	protected.Post("/caixa/abrir", handlers.HandleAbrirCaixa)
	protected.Post("/caixa/fechar", handlers.HandleFecharCaixa)
	protected.Post("/caixa/movimentacao", handlers.HandleMovimentacaoCaixa)
	protected.Get("/caixa/relatorio/:id", handlers.HandleGetCaixaRelatorio)
	protected.Get("/caixa/turnos", handlers.HandleListCaixaTurnos)

	// PDV: Fiscal
	protected.Post("/fiscal/emitir", handlers.HandleEmitirFiscal)

	// WebSocket real-time subscription route
	// Using handlers.WSAuth to validate query parameter ?token=...
	app.Get("/ws", handlers.WSAuth, websocket.New(handlers.WSConnectionHandler))

	// 7. Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server is running on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Error starting Fiber server: %v", err)
	}
}
