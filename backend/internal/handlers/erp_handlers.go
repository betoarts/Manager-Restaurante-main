package handlers

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"

	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/pkg/database"
	"manager-restaurant/backend/pkg/middleware"
)

// --- FORNECEDORES ---

func HandleGetFornecedores(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()
	var fornecedores []domain.Fornecedor
	if err := db.Scopes(middleware.TenantScope(tenantID)).Find(&fornecedores).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch fornecedores"})
	}
	return c.JSON(fornecedores)
}

func HandleCreateFornecedor(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(domain.Fornecedor)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	req.TenantID = tenantID
	req.Ativo = true

	db := database.GetDB()
	if err := db.Create(req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create fornecedor"})
	}
	return c.Status(fiber.StatusCreated).JSON(req)
}

func HandleUpdateFornecedor(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID"})
	}

	db := database.GetDB()
	var fornecedor domain.Fornecedor
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&fornecedor, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Fornecedor not found"})
	}

	req := new(domain.Fornecedor)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	fornecedor.Nome = req.Nome
	fornecedor.CNPJ = req.CNPJ
	fornecedor.Telefone = req.Telefone
	fornecedor.Email = req.Email
	fornecedor.Ativo = req.Ativo
	fornecedor.UpdatedAt = time.Now()

	if err := db.Save(&fornecedor).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update fornecedor"})
	}
	return c.JSON(fornecedor)
}

func HandleDeleteFornecedor(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID"})
	}

	db := database.GetDB()
	var fornecedor domain.Fornecedor
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&fornecedor, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Fornecedor not found"})
	}

	fornecedor.Ativo = false
	if err := db.Save(&fornecedor).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete fornecedor"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// --- COMPRAS (NOTAS FISCAIS) ---

type CreateCompraReq struct {
	FornecedorID   uint                `json:"fornecedor_id"`
	NumeroNF       string              `json:"numero_nf"`
	DataCompra     time.Time           `json:"data_compra"`
	ValorTotal     float64             `json:"valor_total"`
	GerarConta     bool                `json:"gerar_conta"`
	DataVencimento time.Time           `json:"data_vencimento"`
	Itens          []domain.CompraItem `json:"itens"`
}

func HandleGetCompras(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()
	var compras []domain.Compra
	if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Fornecedor").Preload("Itens").Preload("Itens.Produto").Order("data_compra desc").Find(&compras).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch compras"})
	}
	return c.JSON(compras)
}

func HandleCreateCompra(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(CreateCompraReq)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.FornecedorID == 0 || len(req.Itens) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Fornecedor and items are required"})
	}

	db := database.GetDB()
	tx := db.Begin()

	// 1. Criar a Compra
	compra := domain.Compra{
		TenantID:     tenantID,
		FornecedorID: req.FornecedorID,
		NumeroNF:     req.NumeroNF,
		DataCompra:   req.DataCompra,
		ValorTotal:   req.ValorTotal,
		Status:       "recebida",
		CreatedAt:    time.Now(),
	}

	if err := tx.Create(&compra).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create compra: " + err.Error()})
	}

	// 2. Criar os Itens da Compra e Atualizar Estoque
	for _, itemReq := range req.Itens {
		item := domain.CompraItem{
			CompraID:   compra.ID,
			ProdutoID:  itemReq.ProdutoID,
			Quantidade: itemReq.Quantidade,
			CustoUnid:  itemReq.CustoUnid,
			Subtotal:   itemReq.Subtotal,
		}
		if err := tx.Create(&item).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create compra item: " + err.Error()})
		}

		// Atualizar o Estoque do Produto (soma a quantidade)
		var stock domain.Estoque
		if err := tx.Scopes(middleware.TenantScope(tenantID)).Where("produto_id = ?", item.ProdutoID).First(&stock).Error; err == nil {
			stock.Quantidade += item.Quantidade
			if err := tx.Save(&stock).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update stock: " + err.Error()})
			}
		} else {
			// Se nao existia registro de estoque, cria um
			stock = domain.Estoque{
				TenantID:   tenantID,
				ProdutoID:  item.ProdutoID,
				Quantidade: item.Quantidade,
				Minimo:     0,
				Alerta:     false,
			}
			if err := tx.Create(&stock).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create stock: " + err.Error()})
			}
		}

		// Registrar Movimentação
		tx.Create(&domain.MovimentacaoEstoque{
			TenantID:   tenantID,
			ProdutoID:  item.ProdutoID,
			Quantidade: item.Quantidade,
			Tipo:       "entrada",
			Motivo:     "NF " + req.NumeroNF + " (Fornecedor ID " + strconv.Itoa(int(req.FornecedorID)) + ")",
			UsuarioID:  middleware.GetUserID(c),
			CreatedAt:  time.Now(),
		})
	}

	// 3. Gerar Conta a Pagar (Opcional)
	if req.GerarConta {
		conta := domain.ContaPagar{
			TenantID:       tenantID,
			FornecedorID:   &req.FornecedorID,
			CompraID:       &compra.ID,
			Descricao:      "NF: " + req.NumeroNF,
			Valor:          req.ValorTotal,
			DataVencimento: req.DataVencimento,
			Status:         "pendente",
			CreatedAt:      time.Now(),
		}
		if err := tx.Create(&conta).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create conta a pagar: " + err.Error()})
		}
	}

	tx.Commit()

	// Recarrega a compra completa
	db.Scopes(middleware.TenantScope(tenantID)).Preload("Fornecedor").Preload("Itens").First(&compra, compra.ID)

	return c.Status(fiber.StatusCreated).JSON(compra)
}

// --- CONTAS A PAGAR ---

func HandleGetContasPagar(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()
	var contas []domain.ContaPagar
	if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Fornecedor").Order("data_vencimento asc").Find(&contas).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch contas a pagar"})
	}
	return c.JSON(contas)
}

func HandleCreateContaPagar(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	req := new(domain.ContaPagar)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.TenantID = tenantID
	req.Status = "pendente"
	req.CreatedAt = time.Now()

	db := database.GetDB()
	if err := db.Create(req).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create conta a pagar: " + err.Error()})
	}

	db.Scopes(middleware.TenantScope(tenantID)).Preload("Fornecedor").First(req, req.ID)
	return c.Status(fiber.StatusCreated).JSON(req)
}

func HandlePayContaPagar(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID"})
	}

	db := database.GetDB()
	var conta domain.ContaPagar
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&conta, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Conta a pagar not found"})
	}

	conta.Status = "paga"
	conta.UpdatedAt = time.Now()

	if err := db.Save(&conta).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to pay conta: " + err.Error()})
	}

	// Registrar a despesa no extrato geral
	lanc := domain.LancamentoFinanceiro{
		TenantID:     tenantID,
		Tipo:         "despesa",
		Categoria:    "pagamento_fornecedor",
		Descricao:    "Pagamento de Conta: " + conta.Descricao,
		Valor:        conta.Valor,
		Data:         time.Now(),
		ContaPagarID: &conta.ID,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	db.Create(&lanc)

	db.Scopes(middleware.TenantScope(tenantID)).Preload("Fornecedor").First(&conta, conta.ID)
	return c.JSON(conta)
}
