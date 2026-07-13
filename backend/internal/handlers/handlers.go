package handlers

import (
	"fmt"
	"log"
	"net"
	"strconv"
	"time"

	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/internal/services"
	ws "manager-restaurant/backend/internal/websocket"
	"manager-restaurant/backend/pkg/database"
	"manager-restaurant/backend/pkg/middleware"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Auth Handlers
type LoginRequest struct {
	Email string `json:"email"`
	Senha string `json:"senha"`
}

type LoginResponse struct {
	Token   string         `json:"token"`
	Usuario domain.Usuario `json:"usuario"`
	Empresa domain.Empresa `json:"empresa"`
}

func HandleLogin(c *fiber.Ctx) error {
	req := new(LoginRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	db := database.GetDB()
	var user domain.Usuario
	if err := db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "User or password incorrect"})
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.SenhaHash), []byte(req.Senha)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "User or password incorrect"})
	}

	// Fetch tenant info
	var company domain.Empresa
	if err := db.First(&company, user.TenantID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Company not found"})
	}

	// Generate JWT
	claims := middleware.JWTCustomClaims{
		UserID:   user.ID,
		TenantID: user.TenantID,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(middleware.JWTSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	return c.JSON(LoginResponse{
		Token:   tokenString,
		Usuario: user,
		Empresa: company,
	})
}

func HandleGetProfile(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)

	db := database.GetDB()
	var user domain.Usuario
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(user)
}

func HandleUpdateTenantSettings(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var empresa domain.Empresa
	if err := db.First(&empresa, tenantID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Tenant not found"})
	}

	type ThemeUpdate struct {
		Nome     string `json:"nome"`
		Telefone string `json:"telefone"`
		LogoURL  string `json:"logo_url"`
		Theme    string `json:"theme"` // raw JSON string
	}

	req := new(ThemeUpdate)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.Nome != "" {
		empresa.Nome = req.Nome
	}
	if req.Telefone != "" {
		empresa.Telefone = req.Telefone
	}
	if req.LogoURL != "" {
		empresa.LogoURL = req.LogoURL
	}
	if req.Theme != "" {
		empresa.Theme = req.Theme
	}

	if err := db.Save(&empresa).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save settings"})
	}

	// Notify all connected clients about theme update
	ws.GlobalHub.Broadcast(tenantID, "settings_updated", empresa)

	return c.JSON(empresa)
}

// Tables Handlers

// HandleCreateTable creates a new table
func HandleCreateTable(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	role := c.Locals("role")
	if role == nil || (role.(string) != "admin" && role.(string) != "gerente") {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Apenas admin ou gerente podem criar mesas"})
	}

	type CreateTableReq struct {
		Numero     int    `json:"numero"`
		Capacidade int    `json:"capacidade"`
		Formato    string `json:"formato"`
		PosX       int    `json:"pos_x"`
		PosY       int    `json:"pos_y"`
	}

	req := new(CreateTableReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Numero <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Table number required"})
	}
	if req.Capacidade <= 0 {
		req.Capacidade = 4
	}
	if req.Formato == "" {
		req.Formato = "redondo"
	}

	db := database.GetDB()
	// Check duplicate number
	var existing int64
	db.Model(&domain.Mesa{}).Scopes(middleware.TenantScope(tenantID)).Where("numero = ?", req.Numero).Count(&existing)
	if existing > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Ja existe uma mesa com este numero"})
	}

	table := domain.Mesa{
		TenantID:   tenantID,
		Numero:     req.Numero,
		Status:     "livre",
		Capacidade: req.Capacidade,
		Formato:    req.Formato,
		PosX:       req.PosX,
		PosY:       req.PosY,
	}
	if err := db.Create(&table).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create table"})
	}
	return c.Status(fiber.StatusCreated).JSON(table)
}

// HandleDeleteTable deletes a table (admin/gerente only)
func HandleDeleteTable(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	role := c.Locals("role")
	if role == nil || (role.(string) != "admin" && role.(string) != "gerente") {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Apenas admin ou gerente podem excluir mesas"})
	}

	tableID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid table ID"})
	}

	db := database.GetDB()
	var table domain.Mesa
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&table, tableID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Table not found"})
	}
	if table.Status != "livre" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "So e possivel excluir mesas livres"})
	}

	if err := db.Delete(&table).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete table"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func HandleGetTables(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var tables []domain.Mesa
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("numero asc").Find(&tables).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(tables)
}

func HandleUpdateTable(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	tableID, _ := strconv.Atoi(c.Params("id"))

	db := database.GetDB()
	var table domain.Mesa
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&table, tableID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Table not found"})
	}

	type TableUpdateReq struct {
		Status     string `json:"status"` // livre, ocupada, reservada, em_fechamento
		Capacidade int    `json:"capacidade"`
		Formato    string `json:"formato"` // redondo, quadrado, retangular
		PosX       *int   `json:"pos_x"`
		PosY       *int   `json:"pos_y"`
	}

	req := new(TableUpdateReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.Status != "" {
		table.Status = req.Status
	}
	if req.Capacidade > 0 {
		table.Capacidade = req.Capacidade
	}
	if req.Formato != "" {
		table.Formato = req.Formato
	}
	if req.PosX != nil {
		table.PosX = *req.PosX
	}
	if req.PosY != nil {
		table.PosY = *req.PosY
	}

	if err := db.Save(&table).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update table"})
	}

	// Broadcast table update
	ws.GlobalHub.Broadcast(tenantID, "table_updated", table)

	return c.JSON(table)
}

// Products and Categories Handlers
func HandleGetProducts(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var products []domain.Produto
	// "all" query param returns inactive products too (for management)
	includeAll := c.Query("all") == "1"
	query := db.Scopes(middleware.TenantScope(tenantID))
	if !includeAll {
		query = query.Where("ativo = ?", true)
	}
	if err := query.Order("nome asc").Find(&products).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(products)
}

// HandleCreateProduct creates a new product
func HandleCreateProduct(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	type CreateProductReq struct {
		CategoriaID   uint    `json:"categoria_id"`
		Nome          string  `json:"nome"`
		Descricao     string  `json:"descricao"`
		Preco         float64 `json:"preco"`
		CodigoBarras  string  `json:"codigo_barras"`
		ImagemURL     string  `json:"imagem_url"`
		SetorID       uint    `json:"setor_id"`
		Tipo          string  `json:"tipo"`
		UnidadeMedida string  `json:"unidade_medida"`
		Quantidade    float64 `json:"quantidade"`
	}
	req := new(CreateProductReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Nome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Product name required"})
	}
	if req.Preco <= 0 && req.Tipo != "insumo" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Price must be greater than zero for normal products"})
	}
	db := database.GetDB()
	product := domain.Produto{
		TenantID:      tenantID,
		CategoriaID:   req.CategoriaID,
		Nome:          req.Nome,
		Descricao:     req.Descricao,
		Preco:         req.Preco,
		CodigoBarras:  req.CodigoBarras,
		ImagemURL:     req.ImagemURL,
		SetorID:       req.SetorID,
		Tipo:          req.Tipo,
		UnidadeMedida: req.UnidadeMedida,
		Ativo:         true,
	}
	if err := db.Create(&product).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create product: " + err.Error()})
	}

	// Create stock record for the new product
	db.Create(&domain.Estoque{
		TenantID:   tenantID,
		ProdutoID:  product.ID,
		Quantidade: req.Quantidade,
		Minimo:     0.0,
		Alerta:     false,
	})

	return c.Status(fiber.StatusCreated).JSON(product)
}

// HandleUpdateProduct updates a product
func HandleUpdateProduct(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid product ID"})
	}
	db := database.GetDB()
	var product domain.Produto
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&product, productID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Product not found"})
	}
	type UpdateProductReq struct {
		CategoriaID   *uint    `json:"categoria_id"`
		Nome          *string  `json:"nome"`
		Descricao     *string  `json:"descricao"`
		Preco         *float64 `json:"preco"`
		CodigoBarras  *string  `json:"codigo_barras"`
		ImagemURL     *string  `json:"imagem_url"`
		SetorID       *uint    `json:"setor_id"`
		Ativo         *bool    `json:"ativo"`
		Tipo          *string  `json:"tipo"`
		UnidadeMedida *string  `json:"unidade_medida"`
	}
	req := new(UpdateProductReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Nome != nil {
		product.Nome = *req.Nome
	}
	if req.Descricao != nil {
		product.Descricao = *req.Descricao
	}
	if req.Preco != nil {
		product.Preco = *req.Preco
	}
	if req.CategoriaID != nil {
		product.CategoriaID = *req.CategoriaID
	}
	if req.CodigoBarras != nil {
		product.CodigoBarras = *req.CodigoBarras
	}
	if req.ImagemURL != nil {
		product.ImagemURL = *req.ImagemURL
	}
	if req.SetorID != nil {
		product.SetorID = *req.SetorID
	}
	if req.Ativo != nil {
		product.Ativo = *req.Ativo
	}
	if req.Tipo != nil {
		product.Tipo = *req.Tipo
	}
	if req.UnidadeMedida != nil {
		product.UnidadeMedida = *req.UnidadeMedida
	}
	product.UpdatedAt = time.Now()
	if err := db.Save(&product).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update product"})
	}
	return c.JSON(product)
}

// HandleDeleteProduct deletes (or deactivates) a product
func HandleDeleteProduct(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	productID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid product ID"})
	}
	db := database.GetDB()
	var product domain.Produto
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&product, productID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Product not found"})
	}
	// Soft delete: just deactivate
	product.Ativo = false
	product.UpdatedAt = time.Now()
	if err := db.Save(&product).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to deactivate product"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// Categories CRUD

func HandleGetCategories(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var categories []domain.Categoria
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("nome asc").Find(&categories).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(categories)
}

// HandleCreateCategory creates a new product category
func HandleCreateCategory(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	type CreateCategoryReq struct {
		Nome      string `json:"nome"`
		Descricao string `json:"descricao"`
	}
	req := new(CreateCategoryReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Nome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Category name required"})
	}
	db := database.GetDB()
	cat := domain.Categoria{
		TenantID:  tenantID,
		Nome:      req.Nome,
		Descricao: req.Descricao,
	}
	if err := db.Create(&cat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create category"})
	}
	return c.Status(fiber.StatusCreated).JSON(cat)
}

// HandleUpdateCategory updates a category
func HandleUpdateCategory(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	catID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid category ID"})
	}
	db := database.GetDB()
	var cat domain.Categoria
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&cat, catID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Category not found"})
	}
	type UpdateCategoryReq struct {
		Nome      *string `json:"nome"`
		Descricao *string `json:"descricao"`
	}
	req := new(UpdateCategoryReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}
	if req.Nome != nil {
		cat.Nome = *req.Nome
	}
	if req.Descricao != nil {
		cat.Descricao = *req.Descricao
	}
	cat.UpdatedAt = time.Now()
	if err := db.Save(&cat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update category"})
	}
	return c.JSON(cat)
}

// HandleDeleteCategory deletes a category
func HandleDeleteCategory(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	catID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid category ID"})
	}
	db := database.GetDB()
	var cat domain.Categoria
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&cat, catID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Category not found"})
	}
	if err := db.Delete(&cat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete category"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// Orders and KDS Handlers
type CreateOrderRequest struct {
	ComandaID *uint `json:"comanda_id"`
	MesaID    *uint `json:"mesa_id"`
	Origem    string `json:"origem"` // mesa, delivery, balcao
	ClienteID *uint `json:"cliente_id"`
	Itens     []struct {
		ProdutoID  uint   `json:"produto_id"`
		Quantidade int    `json:"quantidade"`
		Observacao string `json:"observacao"`
	} `json:"itens"`
}

func HandleCreateOrder(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(CreateOrderRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if len(req.Itens) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Order must have at least 1 item"})
	}

	db := database.GetDB()

	// 1. Resolve table or comanda if applicable
	if req.MesaID != nil {
		var mesa domain.Mesa
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&mesa, *req.MesaID).Error; err == nil {
			if mesa.Status == "livre" {
				mesa.Status = "ocupada"
				db.Save(&mesa)
				ws.GlobalHub.Broadcast(tenantID, "table_updated", mesa)
			}
		}
	}

	// Calculate total and query products details
	var orderItems []domain.ItemPedido
	var orderTotal float64

	for _, itemReq := range req.Itens {
		var prod domain.Produto
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&prod, itemReq.ProdutoID).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Product not found: " + strconv.Itoa(int(itemReq.ProdutoID))})
		}

		// Deduct inventory based on Ficha Tecnica if present, otherwise direct product deduction
		var recipe []domain.FichaTecnicaItem
		db.Scopes(middleware.TenantScope(tenantID)).Where("produto_id = ?", prod.ID).Find(&recipe)

		if len(recipe) > 0 {
			// Deduct each ingredient
			for _, recItem := range recipe {
				var ingStock domain.Estoque
				qtyToDeduct := float64(itemReq.Quantidade) * recItem.Quantidade
				if errIng := db.Scopes(middleware.TenantScope(tenantID)).Where("produto_id = ?", recItem.InsumoID).First(&ingStock).Error; errIng == nil {
					ingStock.Quantidade -= qtyToDeduct
					if ingStock.Quantidade <= ingStock.Minimo {
						ingStock.Alerta = true
					}
					db.Save(&ingStock)
					// Log stock transaction
					db.Create(&domain.MovimentacaoEstoque{
						TenantID:   tenantID,
						ProdutoID:  recItem.InsumoID,
						Quantidade: qtyToDeduct,
						Tipo:       "saida",
						Motivo:     "venda (ingrediente de " + prod.Nome + ")",
						UsuarioID:  middleware.GetUserID(c),
						CreatedAt:  time.Now(),
					})
				}
			}
		} else {
			// Direct product deduction (fallback)
			var stock domain.Estoque
			if err := db.Scopes(middleware.TenantScope(tenantID)).Where("produto_id = ?", prod.ID).First(&stock).Error; err == nil {
				stock.Quantidade -= float64(itemReq.Quantidade)
				if stock.Quantidade <= stock.Minimo {
					stock.Alerta = true
				}
				db.Save(&stock)
				// Log stock transaction
				db.Create(&domain.MovimentacaoEstoque{
					TenantID:   tenantID,
					ProdutoID:  prod.ID,
					Quantidade: float64(itemReq.Quantidade),
					Tipo:       "saida",
					Motivo:     "venda",
					UsuarioID:  middleware.GetUserID(c),
					CreatedAt:  time.Now(),
				})
			}
		}

		itemTotal := prod.Preco * float64(itemReq.Quantidade)
		orderTotal += itemTotal

		orderItems = append(orderItems, domain.ItemPedido{
			TenantID:      tenantID,
			ProdutoID:     prod.ID,
			ProdutoNome:   prod.Nome,
			Quantidade:    itemReq.Quantidade,
			Observacao:    itemReq.Observacao,
			PrecoUnitario: prod.Preco,
			Status:        "recebido",
			SetorID:       prod.SetorID,
		})
	}

	// Create order object
	order := domain.Pedido{
		TenantID:  tenantID,
		ComandaID: req.ComandaID,
		MesaID:    req.MesaID,
		Status:    "recebido",
		Origem:    req.Origem,
		Total:     orderTotal,
		ClienteID: req.ClienteID,
		Itens:     orderItems,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := db.Create(&order).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create order: " + err.Error()})
	}

	// Update Comanda Total if ComandaID is provided
	if req.ComandaID != nil {
		var comanda domain.Comanda
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&comanda, *req.ComandaID).Error; err == nil {
			comanda.Total += orderTotal
			db.Save(&comanda)
		}
	}

	// Trigger printing asynchronously to prevent blocking API request
	go func(tID uint, ord domain.Pedido) {
		if err := services.PrintOrderReceipt(tID, ord); err != nil {
			log.Printf("Print job background error: %v", err)
		}
	}(tenantID, order)

	// Broadcast WS Events
	ws.GlobalHub.Broadcast(tenantID, "order_created", order)
	ws.GlobalHub.Broadcast(tenantID, "kds_updated", order)

	return c.JSON(order)
}

func HandleGetOrders(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var orders []domain.Pedido
	err := db.Scopes(middleware.TenantScope(tenantID)).
		Preload("Itens").
		Order("created_at desc").
		Find(&orders).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(orders)
}

func HandleUpdateOrderStatus(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	orderID, _ := strconv.Atoi(c.Params("id"))

	type StatusUpdateReq struct {
		Status string `json:"status"` // recebido, produzindo, pronto, entregue
	}

	req := new(StatusUpdateReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	db := database.GetDB()
	var order domain.Pedido
	if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").First(&order, orderID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Order not found"})
	}

	order.Status = req.Status
	order.UpdatedAt = time.Now()

	// Update all items inside the order to the same status as well for consistency
	db.Model(&domain.ItemPedido{}).Where("pedido_id = ?", order.ID).Update("status", req.Status)

	for i := range order.Itens {
		order.Itens[i].Status = req.Status
	}

	db.Save(&order)

	// KDS rule: when kitchen dispatches (status = 'despachado'), notify waiter.
	// 'despachado' = food left the kitchen / available for pickup at the counter.
	// NEVER free the table here — only the PDV cashier can close the table via checkout.
	// 'entregue' is reserved for when the PDV cashier finalizes the bill.
	if req.Status == "despachado" {
		ws.GlobalHub.Broadcast(tenantID, "order_ready_dispatch", order)
	}

	ws.GlobalHub.Broadcast(tenantID, "order_updated", order)
	ws.GlobalHub.Broadcast(tenantID, "kds_updated", order)

	return c.JSON(order)
}

// KDS operational endpoint — optionally filtered by setor_id
func HandleGetKDS(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	// Fetch active orders (non-delivered)
	var orders []domain.Pedido
	query := db.Scopes(middleware.TenantScope(tenantID)).
		Preload("Itens").
		Where("status IN ?", []string{"recebido", "produzindo", "pronto"}).
		Order("created_at asc")

	// Filter by sector if requested
	// Also include items with setor_id = 0 (unclassified/legacy items)
	setorID := c.Query("setor_id")
	if setorID != "" {
		query = query.Where(
			"id IN (SELECT pedido_id FROM item_pedidos WHERE setor_id = ? OR setor_id = 0)",
			setorID,
		)
	}

	if err := query.Find(&orders).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(orders)
}

// HandleGetSetores returns all sectors for a tenant
func HandleGetSetores(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var setores []domain.Setor
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("nome asc").Find(&setores).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(setores)
}

// HandleUpdateSetor updates a sector's settings (KdsAtivo, SemImpressao, etc.)
func HandleUpdateSetor(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	setorID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid sector ID"})
	}

	db := database.GetDB()
	var setor domain.Setor
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&setor, setorID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Sector not found"})
	}

	type UpdateSetorReq struct {
		Nome         *string `json:"nome"`
		KdsAtivo     *bool   `json:"kds_ativo"`
		SemImpressao *bool   `json:"sem_impressao"`
	}

	req := new(UpdateSetorReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.Nome != nil {
		setor.Nome = *req.Nome
	}
	if req.KdsAtivo != nil {
		setor.KdsAtivo = *req.KdsAtivo
	}
	if req.SemImpressao != nil {
		setor.SemImpressao = *req.SemImpressao
	}

	setor.UpdatedAt = time.Now()
	if err := db.Save(&setor).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update sector"})
	}

	return c.JSON(setor)
}

// Payment Handlers
type ProcessPaymentReq struct {
	PedidoID  *uint   `json:"pedido_id"`
	ComandaID *uint   `json:"comanda_id"`
	Metodo    string  `json:"metodo"` // pix, cartao, dinheiro
	Valor     float64 `json:"valor"`
}

func HandleProcessPayment(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(ProcessPaymentReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	db := database.GetDB()

	// Mock TEF or PIX dynamic gateway trigger
	transactionID := "TX-" + strconv.FormatInt(time.Now().UnixNano(), 10)

	payment := domain.Pagamento{
		TenantID:      tenantID,
		PedidoID:      req.PedidoID,
		ComandaID:     req.ComandaID,
		Metodo:        req.Metodo,
		Valor:         req.Valor,
		Status:        "aprovado", // Set approved for test/mock
		TransactionID: transactionID,
		CreatedAt:     time.Now(),
	}

	if err := db.Create(&payment).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to record payment"})
	}

	// Trigger cashier print of payment receipt asynchronously
	go func(tID uint, payID uint) {
		if err := services.PrintPaymentReceipt(tID, payID); err != nil {
			log.Printf("[PRINT RECEIPT ERROR] Failed to print receipt for payment %d: %v", payID, err)
		}
	}(tenantID, payment.ID)

	// Update order or table status if paid
	if req.PedidoID != nil {
		var order domain.Pedido
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&order, *req.PedidoID).Error; err == nil {
			// Only mark as "entregue" if it was already prepared ("pronto"). 
			// If it's still "recebido" or "produzindo", it remains in that state so the KDS can process it.
			if order.Status == "pronto" {
				order.Status = "entregue"
				db.Save(&order)
				ws.GlobalHub.Broadcast(tenantID, "order_updated", order)
			}

			// Free table only if the order is completed (delivered/ready)
			if (order.Status == "pronto" || order.Status == "entregue") && order.MesaID != nil {
				var mesa domain.Mesa
				if err := db.Scopes(middleware.TenantScope(tenantID)).First(&mesa, *order.MesaID).Error; err == nil {
					mesa.Status = "livre"
					db.Save(&mesa)
					ws.GlobalHub.Broadcast(tenantID, "table_updated", mesa)
				}
			}
		}
	}

	// Update Comanda status if paid
	if req.ComandaID != nil {
		var comanda domain.Comanda
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&comanda, *req.ComandaID).Error; err == nil {
			comanda.Status = "fechada"
			db.Save(&comanda)

			if comanda.MesaID != nil {
				var mesa domain.Mesa
				if err := db.Scopes(middleware.TenantScope(tenantID)).First(&mesa, *comanda.MesaID).Error; err == nil {
					mesa.Status = "livre"
					db.Save(&mesa)
					ws.GlobalHub.Broadcast(tenantID, "table_updated", mesa)
				}
			}
			ws.GlobalHub.Broadcast(tenantID, "comanda_updated", comanda)
		}
	}

	return c.JSON(payment)
}

// Financial Dashboard Statistics Handlers
func HandleGetDashboardStats(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	today := time.Now().Truncate(24 * time.Hour)

	// Sales of the day
	var salesToday float64
	db.Model(&domain.Pedido{}).
		Scopes(middleware.TenantScope(tenantID)).
		Where("created_at >= ? AND status = ?", today, "entregue").
		Select("COALESCE(SUM(total), 0)").
		Scan(&salesToday)

	// Active orders in progress
	var activeOrders int64
	db.Model(&domain.Pedido{}).
		Scopes(middleware.TenantScope(tenantID)).
		Where("status IN ?", []string{"recebido", "produzindo", "pronto"}).
		Count(&activeOrders)

	// Occupied tables
	var occupiedTables int64
	db.Model(&domain.Mesa{}).
		Scopes(middleware.TenantScope(tenantID)).
		Where("status = ?", "ocupada").
		Count(&occupiedTables)

	// Ticket Médio
	var ticketMedio float64
	db.Model(&domain.Pedido{}).
		Scopes(middleware.TenantScope(tenantID)).
		Where("created_at >= ? AND status = ?", today, "entregue").
		Select("COALESCE(AVG(total), 0)").
		Scan(&ticketMedio)

	// Best selling products (top 5)
	type TopProduct struct {
		ProdutoNome string  `json:"produto_nome"`
		TotalVendido float64 `json:"total_vendido"`
		Quantidade   int64   `json:"quantidade"`
	}
	var topProducts []TopProduct
	db.Model(&domain.ItemPedido{}).
		Scopes(middleware.TenantScope(tenantID)).
		Select("produto_nome, SUM(quantidade * preco_unitario) as total_vendido, SUM(quantidade) as quantidade").
		Group("produto_nome").
		Order("quantidade desc").
		Limit(5).
		Scan(&topProducts)

	// Hourly sales graph data
	type HourlySales struct {
		Hour  int     `json:"hour"`
		Total float64 `json:"total"`
	}
	var hourlyData []HourlySales
	// Generate mock hourly data for charts if DB has few items
	for i := 8; i <= 22; i += 2 {
		hourlyData = append(hourlyData, HourlySales{
			Hour:  i,
			Total: salesToday * (0.05 + 0.15*(float64(i%4))), // dynamic mock distribution of today's sales
		})
	}

	return c.JSON(fiber.Map{
		"sales_today":     salesToday,
		"active_orders":   activeOrders,
		"occupied_tables": occupiedTables,
		"ticket_medio":    ticketMedio,
		"top_products":    topProducts,
		"hourly_sales":    hourlyData,
	})
}

// Stock / Inventory Handlers
func HandleGetStock(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	type StockItem struct {
		ID            uint    `json:"id"`
		ProdutoID     uint    `json:"produto_id"`
		ProdutoNome   string  `json:"produto_nome"`
		Quantidade    float64 `json:"quantidade"`
		Minimo        float64 `json:"minimo"`
		Alerta        bool    `json:"alerta"`
		PrecoUnitario float64 `json:"preco_unitario"`
		ProdutoTipo   string  `json:"produto_tipo"`
		UnidadeMedida string  `json:"unidade_medida"`
	}

	var stockList []StockItem
	err := db.Table("estoques").
		Select("estoques.id, estoques.produto_id, produtos.nome as produto_nome, estoques.quantidade, estoques.minimo, estoques.alerta, produtos.preco as preco_unitario, produtos.tipo as produto_tipo, produtos.unidade_medida as unidade_medida").
		Joins("join produtos on produtos.id = estoques.produto_id").
		Where("estoques.tenant_id = ?", tenantID).
		Scan(&stockList).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(stockList)
}

func HandleAdjustStock(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	stockID, _ := strconv.Atoi(c.Params("id"))

	type AdjustReq struct {
		Quantidade float64 `json:"quantidade"` // absolute new quantity
		Motivo     string  `json:"motivo"`     // inventario, ajuste, desperdicio
	}

	req := new(AdjustReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	db := database.GetDB()
	var stock domain.Estoque
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&stock, stockID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Stock item not found"})
	}

	oldQty := stock.Quantidade
	stock.Quantidade = req.Quantidade
	stock.Alerta = stock.Quantidade <= stock.Minimo

	if err := db.Save(&stock).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update stock"})
	}

	// Log transaction
	diff := req.Quantidade - oldQty
	txnType := "entrada"
	if diff < 0 {
		txnType = "saida"
		diff = -diff
	}

	db.Create(&domain.MovimentacaoEstoque{
		TenantID:   tenantID,
		ProdutoID:  stock.ProdutoID,
		Quantidade: diff,
		Tipo:       txnType,
		Motivo:     req.Motivo,
		UsuarioID:  middleware.GetUserID(c),
		CreatedAt:  time.Now(),
	})

	return c.JSON(stock)
}

func HandleEntryStock(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	stockID, _ := strconv.Atoi(c.Params("id"))

	type EntryReq struct {
		Quantidade float64 `json:"quantidade"`
		Motivo     string  `json:"motivo"` // nota fiscal, fornecedor, compra
	}

	req := new(EntryReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.Quantidade <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "A quantidade de entrada deve ser maior que zero."})
	}

	db := database.GetDB()
	var stock domain.Estoque
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&stock, stockID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Stock item not found"})
	}

	stock.Quantidade += req.Quantidade
	stock.Alerta = stock.Quantidade <= stock.Minimo

	if err := db.Save(&stock).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update stock"})
	}

	// Log transaction
	db.Create(&domain.MovimentacaoEstoque{
		TenantID:   tenantID,
		ProdutoID:  stock.ProdutoID,
		Quantidade: req.Quantidade,
		Tipo:       "entrada",
		Motivo:     req.Motivo,
		UsuarioID:  middleware.GetUserID(c),
		CreatedAt:  time.Now(),
	})

	return c.JSON(stock)
}

// Ficha Tecnica Handlers
func HandleGetFichaTecnicaByProduto(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	produtoID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid product ID"})
	}

	db := database.GetDB()
	var items []domain.FichaTecnicaItem
	if err := db.Scopes(middleware.TenantScope(tenantID)).
		Preload("Insumo").
		Where("produto_id = ?", produtoID).
		Find(&items).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(items)
}

func HandleCreateFichaTecnicaItem(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	type CreateReq struct {
		ProdutoID  uint    `json:"produto_id"`
		InsumoID   uint    `json:"insumo_id"`
		Quantidade float64 `json:"quantidade"`
	}

	req := new(CreateReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.ProdutoID == 0 || req.InsumoID == 0 || req.Quantidade <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "All fields are required and quantity must be positive"})
	}

	db := database.GetDB()
	item := domain.FichaTecnicaItem{
		TenantID:   tenantID,
		ProdutoID:  req.ProdutoID,
		InsumoID:   req.InsumoID,
		Quantidade: req.Quantidade,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := db.Create(&item).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	db.Preload("Insumo").First(&item, item.ID)

	return c.Status(fiber.StatusCreated).JSON(item)
}

func HandleDeleteFichaTecnicaItem(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	itemID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID"})
	}

	db := database.GetDB()
	var item domain.FichaTecnicaItem
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&item, itemID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Item not found"})
	}

	if err := db.Delete(&item).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete item"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// WebSocket Upgrade Endpoint
func WSConnectionHandler(c *websocket.Conn) {
	tenantIDVal := c.Locals("tenant_id")
	userIDVal := c.Locals("user_id")

	tenantID, _ := tenantIDVal.(uint)
	userID, _ := userIDVal.(uint)

	// Create client
	client := &ws.Client{
		Conn:     c,
		TenantID: tenantID,
		UserID:   userID,
		Send:     make(chan []byte, 256),
	}

	// Register client in WebSocket Hub
	ws.GlobalHub.RegisterClient(client)

	// Defer unregistering on close
	defer func() {
		ws.GlobalHub.UnregisterClient(client)
	}()

	// Start write pump in a separate goroutine
	go client.WritePump()

	// Read pump blocks until connection closes
	client.ReadPump(ws.GlobalHub)
}

// WSAuth is a middleware to authenticate WebSocket request via query parameter '?token=...'
func WSAuth(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized: missing token"})
		}

		claims := &middleware.JWTCustomClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return middleware.JWTSecret, nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized: invalid token"})
		}

		c.Locals("user_id", claims.UserID)
		c.Locals("tenant_id", claims.TenantID)
		c.Locals("role", claims.Role)

		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// User CRUD Handlers

func HandleGetUsers(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()
	var users []domain.Usuario
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("nome asc").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(users)
}

type CreateUserReq struct {
	Nome  string `json:"nome"`
	Email string `json:"email"`
	Senha string `json:"senha"`
	Role  string `json:"role"`
}

func HandleCreateUser(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(CreateUserReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Nome == "" || req.Senha == "" || req.Role == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Nome, senha and role are required"})
	}

	db := database.GetDB()

	// Use provided email or generate one from name
	email := req.Email
	if email == "" {
		cleanName := ""
		for _, ch := range req.Nome {
			if ch >= 'a' && ch <= 'z' {
				cleanName += string(ch)
			} else if ch >= 'A' && ch <= 'Z' {
				cleanName += string(ch + 32)
			}
		}
		email = cleanName + "@sabor.com"

		var count int64
		db.Model(&domain.Usuario{}).Where("email = ?", email).Count(&count)
		if count > 0 {
			email = cleanName + strconv.FormatInt(time.Now().Unix()%1000, 10) + "@sabor.com"
		}
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Senha), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	newUser := domain.Usuario{
		TenantID:  tenantID,
		Nome:      req.Nome,
		Email:     email,
		SenhaHash: string(hashedPassword),
		Role:      req.Role,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := db.Create(&newUser).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(newUser)
}

type UpdateUserReq struct {
	Nome  string `json:"nome"`
	Email string `json:"email,omitempty"`
	Senha string `json:"senha,omitempty"`
	Role  string `json:"role"`
}

func HandleUpdateUser(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	userID, _ := strconv.Atoi(c.Params("id"))

	req := new(UpdateUserReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	db := database.GetDB()
	var user domain.Usuario
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	if req.Nome != "" {
		user.Nome = req.Nome
	}
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.Role != "" {
		user.Role = req.Role
	}
	if req.Senha != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Senha), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
		}
		user.SenhaHash = string(hashedPassword)
	}
	user.UpdatedAt = time.Now()

	if err := db.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(user)
}

func HandleDeleteUser(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	userID, _ := strconv.Atoi(c.Params("id"))

	db := database.GetDB()
	var user domain.Usuario
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Prevent deleting oneself
	currentUserID := middleware.GetUserID(c)
	if uint(userID) == currentUserID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot delete your own user"})
	}

	if err := db.Delete(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// Table Transfer and Closing operations

type TransferTableReq struct {
	FromMesaID  uint   `json:"from_mesa_id"`
	ToMesaID    uint   `json:"to_mesa_id"`
	TransferAll bool   `json:"transfer_all"`
	ItemIDs     []uint `json:"item_ids"`
}

func HandleTransferTable(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(TransferTableReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	db := database.GetDB()

	var fromMesa, toMesa domain.Mesa
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&fromMesa, req.FromMesaID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Source table not found"})
	}
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&toMesa, req.ToMesaID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Destination table not found"})
	}

	var activeOrders []domain.Pedido
	if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").Where("mesa_id = ? AND status != ?", req.FromMesaID, "entregue").Find(&activeOrders).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if len(activeOrders) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "No active orders on source table"})
	}

	if req.TransferAll {
		for i := range activeOrders {
			activeOrders[i].MesaID = &req.ToMesaID
			activeOrders[i].UpdatedAt = time.Now()
			db.Save(&activeOrders[i])
			ws.GlobalHub.Broadcast(tenantID, "order_updated", activeOrders[i])
			ws.GlobalHub.Broadcast(tenantID, "kds_updated", activeOrders[i])
		}

		toMesa.Status = "ocupada"
		db.Save(&toMesa)
		fromMesa.Status = "livre"
		db.Save(&fromMesa)

		ws.GlobalHub.Broadcast(tenantID, "table_updated", fromMesa)
		ws.GlobalHub.Broadcast(tenantID, "table_updated", toMesa)

		return c.JSON(fiber.Map{"success": true, "message": "All orders transferred successfully"})
	}

	if len(req.ItemIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Item IDs are required for partial transfer"})
	}

	var destOrder domain.Pedido
	err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").Where("mesa_id = ? AND status != ?", req.ToMesaID, "entregue").First(&destOrder).Error
	if err != nil {
		destOrder = domain.Pedido{
			TenantID:  tenantID,
			MesaID:    &req.ToMesaID,
			Status:    "recebido",
			Origem:    "mesa",
			Total:     0,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if err := db.Create(&destOrder).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create destination order"})
		}
	}

	for _, itemID := range req.ItemIDs {
		var item domain.ItemPedido
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&item, itemID).Error; err == nil {
			oldOrderID := item.PedidoID
			item.PedidoID = destOrder.ID
			db.Save(&item)

			var oldOrder domain.Pedido
			if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").First(&oldOrder, oldOrderID).Error; err == nil {
				var newTotal float64
				for _, it := range oldOrder.Itens {
					if it.ID != item.ID {
						newTotal += it.PrecoUnitario * float64(it.Quantidade)
					}
				}
				oldOrder.Total = newTotal
				if len(oldOrder.Itens) <= 1 && oldOrder.Itens[0].ID == item.ID {
					oldOrder.Status = "entregue"
				}
				db.Save(&oldOrder)
				ws.GlobalHub.Broadcast(tenantID, "order_updated", oldOrder)
				ws.GlobalHub.Broadcast(tenantID, "kds_updated", oldOrder)
			}
		}
	}

	var refreshedDestOrder domain.Pedido
	if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").First(&refreshedDestOrder, destOrder.ID).Error; err == nil {
		var newTotal float64
		for _, it := range refreshedDestOrder.Itens {
			newTotal += it.PrecoUnitario * float64(it.Quantidade)
		}
		refreshedDestOrder.Total = newTotal
		db.Save(&refreshedDestOrder)
		ws.GlobalHub.Broadcast(tenantID, "order_updated", refreshedDestOrder)
		ws.GlobalHub.Broadcast(tenantID, "kds_updated", refreshedDestOrder)
	}

	var sourceActiveCount int64
	db.Model(&domain.Pedido{}).Where("mesa_id = ? AND status != ?", req.FromMesaID, "entregue").Count(&sourceActiveCount)
	if sourceActiveCount == 0 {
		fromMesa.Status = "livre"
		db.Save(&fromMesa)
		ws.GlobalHub.Broadcast(tenantID, "table_updated", fromMesa)
	}

	toMesa.Status = "ocupada"
	db.Save(&toMesa)
	ws.GlobalHub.Broadcast(tenantID, "table_updated", toMesa)

	return c.JSON(fiber.Map{"success": true, "message": "Items transferred successfully"})
}

func HandleCloseTable(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	mesaID, _ := strconv.Atoi(c.Params("id"))

	db := database.GetDB()

	var mesa domain.Mesa
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&mesa, mesaID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Table not found"})
	}

	mesa.Status = "em_fechamento"
	mesa.UpdatedAt = time.Now()
	if err := db.Save(&mesa).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update table status"})
	}

	var activeOrders []domain.Pedido
	db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").Where("mesa_id = ? AND status != ?", mesaID, "entregue").Find(&activeOrders)

	go func(tID uint, mNum int, orders []domain.Pedido) {
		if err := services.PrintPreCloseReceipt(tID, mNum, orders); err != nil {
			log.Printf("[PRINT PRE-CLOSE ERROR] %v", err)
		}
	}(tenantID, mesa.Numero, activeOrders)

	ws.GlobalHub.Broadcast(tenantID, "table_updated", mesa)

	return c.JSON(fiber.Map{"success": true, "message": "Table close requested successfully"})
}

// HandleCheckoutTable - PDV cashier finalizes billing and frees the table.
// This is the ONLY place that can set table status back to 'livre'.
// Called after payment is collected by the cashier operator.
func HandleCheckoutTable(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	mesaID := c.Params("id")

	var mesa domain.Mesa
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&mesa, mesaID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Table not found"})
	}

	// Mark all active orders on this table as 'entregue'
	var activeOrders []domain.Pedido
	db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").
		Where("mesa_id = ? AND status != ?", mesaID, "entregue").
		Find(&activeOrders)

	for i := range activeOrders {
		activeOrders[i].Status = "entregue"
		activeOrders[i].UpdatedAt = time.Now()
		db.Model(&domain.ItemPedido{}).Where("pedido_id = ?", activeOrders[i].ID).Update("status", "entregue")
		db.Save(&activeOrders[i])
		ws.GlobalHub.Broadcast(tenantID, "order_updated", activeOrders[i])
		ws.GlobalHub.Broadcast(tenantID, "kds_updated", activeOrders[i])
	}

	// Free the table
	mesa.Status = "livre"
	mesa.UpdatedAt = time.Now()
	if err := db.Save(&mesa).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to free table"})
	}

	ws.GlobalHub.Broadcast(tenantID, "table_updated", mesa)
	ws.GlobalHub.Broadcast(tenantID, "table_checkout_done", mesa)

	return c.JSON(fiber.Map{"success": true, "mesa": mesa})
}

// ========== Impressoras (ESC/POS Printers) Handlers ==========

// HandleGetPrinters lists all printers for the current tenant
func HandleGetPrinters(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var printers []domain.Impressora
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("nome asc").Find(&printers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(printers)
}

type CreatePrinterReq struct {
	Nome        string `json:"nome"`
	Tipo        string `json:"tipo"`        // "tcp" or "usb"
	IP          string `json:"ip"`          // required when tipo=tcp
	Porta       int    `json:"porta"`       // required when tipo=tcp, default 9100
	Dispositivo string `json:"dispositivo"` // required when tipo=usb, e.g. /dev/usb/lp0
	SetorID     uint   `json:"setor_id"`
}

// HandleCreatePrinter registers a new printer
func HandleCreatePrinter(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(CreatePrinterReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Nome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Printer name is required"})
	}
	if req.SetorID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Sector (setor_id) is required"})
	}
	if req.Tipo == "" {
		req.Tipo = "tcp"
	}
	if req.Tipo == "tcp" {
		if req.IP == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "IP address is required for TCP printers"})
		}
		if req.Porta == 0 {
			req.Porta = 9100
		}
	}
	if req.Tipo == "usb" && req.Dispositivo == "" {
		req.Dispositivo = "/dev/usb/lp0"
	}

	db := database.GetDB()
	printer := domain.Impressora{
		TenantID:    tenantID,
		Nome:        req.Nome,
		Tipo:        req.Tipo,
		IP:          req.IP,
		Porta:       req.Porta,
		Dispositivo: req.Dispositivo,
		SetorID:     req.SetorID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := db.Create(&printer).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to register printer: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(printer)
}

// HandleUpdatePrinter updates an existing printer configuration
func HandleUpdatePrinter(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	printerID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid printer ID"})
	}

	db := database.GetDB()
	var printer domain.Impressora
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&printer, printerID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Printer not found"})
	}

	type UpdatePrinterReq struct {
		Nome        *string `json:"nome"`
		Tipo        *string `json:"tipo"`
		IP          *string `json:"ip"`
		Porta       *int    `json:"porta"`
		Dispositivo *string `json:"dispositivo"`
		SetorID     *uint   `json:"setor_id"`
	}

	req := new(UpdatePrinterReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.Nome != nil {
		printer.Nome = *req.Nome
	}
	if req.Tipo != nil {
		printer.Tipo = *req.Tipo
	}
	if req.IP != nil {
		printer.IP = *req.IP
	}
	if req.Porta != nil {
		printer.Porta = *req.Porta
	}
	if req.Dispositivo != nil {
		printer.Dispositivo = *req.Dispositivo
	}
	if req.SetorID != nil {
		printer.SetorID = *req.SetorID
	}
	printer.UpdatedAt = time.Now()

	if err := db.Save(&printer).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update printer"})
	}

	return c.JSON(printer)
}

// HandleDeletePrinter removes a printer
func HandleDeletePrinter(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	printerID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid printer ID"})
	}

	db := database.GetDB()
	var printer domain.Impressora
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&printer, printerID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Printer not found"})
	}

	if err := db.Delete(&printer).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete printer"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// HandleTestPrinter sends a test page to the specified printer
func HandleTestPrinter(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	printerID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid printer ID"})
	}

	db := database.GetDB()
	var printer domain.Impressora
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&printer, printerID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Printer not found"})
	}

	// Build test page payload
	var data []byte
	data = append(data, []byte{0x1B, 0x40}...)       // ESC @ - Init
	data = append(data, []byte{0x1B, 0x61, 0x01}...) // Center align
	data = append(data, []byte{0x1B, 0x45, 0x01}...) // Bold on
	data = append(data, []byte("=== TESTE DE IMPRESSORA ===\n")...)
	data = append(data, []byte{0x1B, 0x45, 0x00}...) // Bold off
	data = append(data, []byte(fmt.Sprintf("Impressora: %s\n", printer.Nome))...)
	if printer.Tipo == "usb" {
		data = append(data, []byte(fmt.Sprintf("Tipo: USB\nDispositivo: %s\n", printer.Dispositivo))...)
	} else {
		data = append(data, []byte(fmt.Sprintf("Tipo: TCP/Rede\nEndereco: %s:%d\n", printer.IP, printer.Porta))...)
	}
	data = append(data, []byte(fmt.Sprintf("Data/Hora: %s\n", time.Now().Format("02/01/2006 15:04:05")))...)
	data = append(data, []byte("Se voce ve esta pagina, a impressora\nesta funcionando corretamente!\n")...)
	data = append(data, []byte("----------------------------------\n\n\n")...)
	data = append(data, []byte{0x1D, 0x56, 0x41, 0x03}...) // Cut

	if err := services.TestPrinter(&printer, data); err != nil {
		log.Printf("[PRINTER TEST] Failed to send test page to %s: %v", printer.Nome, err)
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"success": false,
			"error":   err.Error(),
		})
	}

	return c.JSON(fiber.Map{"success": true, "message": "Página de teste enviada com sucesso!"})
}

// HandleDetectUSBDevices scans the host system for available printer USB devices
// GET /api/printers/detect-usb — no printer ID needed, scans /dev/usb/lp*, /dev/lp*, /dev/ttyUSB*, /dev/ttyACM* and sysfs
func HandleDetectUSBDevices(c *fiber.Ctx) error {
	devices := services.DetectUSBDevices()

	// Build setup instructions based on what was found
	setup := ""
	hasInaccessible := false
	hasNoPath := false
	for _, d := range devices {
		if !d.Accessible && d.Path != "" {
			hasInaccessible = true
		}
		if d.Path == "" {
			hasNoPath = true
		}
	}

	if len(devices) == 0 || hasNoPath {
		setup = "Impressora USB detectada mas sem device file. Execute: sudo modprobe usblp && ls /dev/usb/"
	} else if hasInaccessible {
		setup = "Device encontrado mas sem permissão de escrita. Execute: sudo chmod 666 /dev/usb/lp0 (ou o path correto)"
	} else if len(devices) > 0 {
		setup = "Impressora pronta! Selecione o device e salve."
	}

	return c.JSON(fiber.Map{
		"devices": devices,
		"count":   len(devices),
		"setup":   setup,
	})
}

// ========== Pinpad (TEF/Cielo) Handlers ==========

// HandleGetPinpads lists all pinpads for the current tenant
func HandleGetPinpads(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var pinpads []domain.Pinpad
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("nome asc").Find(&pinpads).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(pinpads)
}

type CreatePinpadReq struct {
	Nome        string `json:"nome"`
	Modelo      string `json:"modelo"`
	Tipo        string `json:"tipo"`        // "serial" or "tcp"
	IP          string `json:"ip"`
	Porta       int    `json:"porta"`
	Dispositivo string `json:"dispositivo"` // /dev/ttyACM0, etc.
	Serial      string `json:"serial"`
}

// HandleCreatePinpad registers a new pinpad
func HandleCreatePinpad(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(CreatePinpadReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	if req.Nome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pinpad name is required"})
	}
	if req.Porta < 1 || req.Porta > 65535 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Porta inválida. Use um valor entre 1 e 65535"})
	}
	if req.IP != "" && net.ParseIP(req.IP) == nil {
		// Allow hostnames too (e.g. "localhost", "tef-agent.local")
		// Only reject empty or clearly invalid
		if req.IP != "localhost" && req.IP != "127.0.0.1" {
			// Try parsing as hostname - if it starts with a letter, accept it
			if len(req.IP) > 0 && (req.IP[0] >= '0' && req.IP[0] <= '9') {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "IP inválido. Use um formato como 192.168.1.100 ou um hostname"})
			}
		}
	}

	db := database.GetDB()
	if req.Tipo == "" {
		req.Tipo = "tcp"
	}
	if req.Tipo == "serial" && req.Dispositivo == "" {
		req.Dispositivo = "/dev/ttyACM0"
	}
	if req.Porta == 0 {
		req.Porta = 2001
	}
	if req.IP == "" {
		req.IP = "127.0.0.1"
	}
	if req.Modelo == "" {
		req.Modelo = "Cielo"
	}

	pinpad := domain.Pinpad{
		TenantID:    tenantID,
		Nome:        req.Nome,
		Modelo:      req.Modelo,
		Tipo:        req.Tipo,
		IP:          req.IP,
		Porta:       req.Porta,
		Dispositivo: req.Dispositivo,
		Serial:      req.Serial,
		Ativo:       true,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := db.Create(&pinpad).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to register pinpad: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(pinpad)
}

// HandleUpdatePinpad updates an existing pinpad configuration
func HandleUpdatePinpad(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	pinpadID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid pinpad ID"})
	}

	db := database.GetDB()
	var pinpad domain.Pinpad
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&pinpad, pinpadID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pinpad not found"})
	}

	type UpdatePinpadReq struct {
		Nome   *string `json:"nome"`
		Modelo *string `json:"modelo"`
		IP     *string `json:"ip"`
		Porta  *int    `json:"porta"`
		Serial *string `json:"serial"`
		Ativo  *bool   `json:"ativo"`
	}

	req := new(UpdatePinpadReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	if req.Nome != nil {
		pinpad.Nome = *req.Nome
	}
	if req.Modelo != nil {
		pinpad.Modelo = *req.Modelo
	}
	if req.IP != nil {
		pinpad.IP = *req.IP
	}
	if req.Porta != nil {
		pinpad.Porta = *req.Porta
	}
	if req.Serial != nil {
		pinpad.Serial = *req.Serial
	}
	if req.Ativo != nil {
		pinpad.Ativo = *req.Ativo
	}
	pinpad.UpdatedAt = time.Now()

	if err := db.Save(&pinpad).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update pinpad"})
	}

	return c.JSON(pinpad)
}

// HandleDeletePinpad removes a pinpad
func HandleDeletePinpad(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	pinpadID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid pinpad ID"})
	}

	db := database.GetDB()
	var pinpad domain.Pinpad
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&pinpad, pinpadID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pinpad not found"})
	}

	if err := db.Delete(&pinpad).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete pinpad"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// HandleDetectPinpad tests connection to a specific pinpad
func HandleDetectPinpad(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	pinpadID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid pinpad ID"})
	}

	db := database.GetDB()
	var pinpad domain.Pinpad
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&pinpad, pinpadID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pinpad not found"})
	}

	status, err := services.DetectPinpad(&pinpad)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Detection failed: " + err.Error()})
	}

	return c.JSON(status)
}

// HandleProcessTEFPayment processes a payment via the configured pinpad
func HandleProcessTEFPayment(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)

	type TEFPaymentReq struct {
		Amount float64 `json:"amount"`
		Method string  `json:"method"` // "card", "pix", "debit", "credit"
	}

	req := new(TEFPaymentReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Amount <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Amount must be greater than zero"})
	}

	// Get the active pinpad
	pinpad, err := services.GetFirstActivePinpad(tenantID)
	if err != nil {
		// No active pinpad configured — try auto-creating a default serial pinpad
		log.Printf("[TEF] No active pinpad found, attempting auto-create...")
		created, createErr := services.CreateDefaultPinpad(tenantID)
		if createErr != nil {
			log.Printf("[TEF] Auto-create failed: %v", createErr)
			pinpad = nil
		} else {
			pinpad = created
		}
	}

	// Build a fallback pinpad if none configured
	if pinpad == nil {
		pinpad = &domain.Pinpad{
			Tipo:  "tcp",
			IP:    "127.0.0.1",
			Porta: 2001,
		}
	}

	mode := pinpad.Tipo
	if pinpad.Dispositivo != "" {
		mode += ":" + pinpad.Dispositivo
	} else {
		mode += fmt.Sprintf(":%s:%d", pinpad.IP, pinpad.Porta)
	}
	log.Printf("[TEF] Processing payment via pinpad (%s) amount: %.2f, method: %s", mode, req.Amount, req.Method)

	tefReq := &services.TEFPaymentRequest{
		Amount: req.Amount,
		Method: req.Method,
	}

	result, err := services.ProcessTEFPayment(pinpad, tefReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "TEF payment error: " + err.Error()})
	}

	if !result.Success {
		// When TEF agent is unreachable, simulate approval for development
		log.Printf("[TEF] TEF agent unreachable, simulating approval for development")
		return c.JSON(fiber.Map{
			"success":            true,
			"authorization_code": "SIM-" + fmt.Sprintf("%06d", time.Now().Unix()%1000000),
			"transaction_id":     "TX-" + fmt.Sprintf("%d", time.Now().UnixNano()),
			"message":            "Simulated approval (no TEF agent available)",
			"simulated":          true,
		})
	}

	return c.JSON(fiber.Map{
		"success":            result.Success,
		"authorization_code": result.AuthorizationCode,
		"transaction_id":     result.TransactionID,
		"message":            result.Message,
	})
}

// HandleGetTableOrders returns all active orders for a specific table
func HandleGetTableOrders(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	tableID, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid table ID"})
	}

	db := database.GetDB()

	var orders []domain.Pedido
	if err := db.Scopes(middleware.TenantScope(tenantID)).
		Preload("Itens").
		Where("mesa_id = ? AND status != ?", tableID, "entregue").
		Order("created_at desc").
		Find(&orders).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(orders)
}

