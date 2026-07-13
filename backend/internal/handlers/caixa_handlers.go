package handlers

import (
	"log"
	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/internal/services"
	"manager-restaurant/backend/pkg/database"
	"manager-restaurant/backend/pkg/middleware"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

// HandleGetCaixaStatus checks if there's an open session
func HandleGetCaixaStatus(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var turno domain.CaixaTurno
	if err := db.Scopes(middleware.TenantScope(tenantID)).Where("status = ?", "aberto").First(&turno).Error; err != nil {
		return c.JSON(fiber.Map{"status": "fechado"})
	}

	return c.JSON(turno)
}

type AbrirCaixaReq struct {
	ValorInicial float64 `json:"valor_inicial"`
}

func HandleAbrirCaixa(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	userID := middleware.GetUserID(c)
	db := database.GetDB()

	var req AbrirCaixaReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var existente domain.CaixaTurno
	if err := db.Scopes(middleware.TenantScope(tenantID)).Where("status = ?", "aberto").First(&existente).Error; err == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Já existe um caixa aberto"})
	}

	turno := domain.CaixaTurno{
		TenantID:     tenantID,
		UsuarioID:    userID,
		Status:       "aberto",
		ValorInicial: req.ValorInicial,
		AbertoEm:     time.Now(),
	}

	if err := db.Create(&turno).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Registrar Abertura como Despesa (Transferência do Cofre) ou Receita inicial
	// Decidimos tratar o fundo de troco como uma Receita no caixa (veio de fora para o caixa) 
	// para bater o saldo, mas no fluxo financeiro geral isso anularia a saída do cofre.
	// Vamos lançar como "abertura_caixa" (tipo receita para o caixa).
	lancamento := domain.LancamentoFinanceiro{
		TenantID:     tenantID,
		Tipo:         "receita",
		Categoria:    "abertura_caixa",
		Descricao:    "Fundo de Troco - Abertura de Caixa #" + strconv.Itoa(int(turno.ID)),
		Valor:        turno.ValorInicial,
		Data:         turno.AbertoEm,
		CaixaTurnoID: &turno.ID,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	db.Create(&lancamento)

	// Imprimir comprovante de abertura do caixa em background
	go func(tid uint, turID uint) {
		if err := services.PrintCaixaAbertura(tid, turID); err != nil {
			log.Printf("[CAIXA PRINT ERROR] falha ao imprimir abertura do caixa: %v", err)
		}
	}(tenantID, turno.ID)

	return c.JSON(turno)
}

type FecharCaixaReq struct {
	ValorFinal float64 `json:"valor_final"`
}

func HandleFecharCaixa(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var req FecharCaixaReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var turno domain.CaixaTurno
	if err := db.Scopes(middleware.TenantScope(tenantID)).Where("status = ?", "aberto").First(&turno).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Nenhum caixa aberto encontrado"})
	}

	now := time.Now()
	turno.Status = "fechado"
	turno.ValorFinal = req.ValorFinal
	turno.FechadoEm = &now

	if err := db.Save(&turno).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Calculate net sales to log as Receita
	// We sum all completed orders for this shift
	var totalVendas float64
	db.Model(&domain.Pedido{}).
		Where("tenant_id = ? AND status IN ('concluido', 'pago') AND updated_at >= ?", tenantID, turno.AbertoEm).
		Select("COALESCE(SUM(total), 0)").Scan(&totalVendas)

	if totalVendas > 0 {
		lancamento := domain.LancamentoFinanceiro{
			TenantID:     tenantID,
			Tipo:         "receita",
			Categoria:    "venda_pdv",
			Descricao:    "Vendas do Turno - Fechamento de Caixa #" + strconv.Itoa(int(turno.ID)),
			Valor:        totalVendas,
			Data:         now,
			CaixaTurnoID: &turno.ID,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		db.Create(&lancamento)
	}

	// Imprimir relatório de fechamento do caixa em background
	go func(tid uint, turID uint) {
		if err := services.PrintCaixaFechamento(tid, turID); err != nil {
			log.Printf("[CAIXA PRINT ERROR] falha ao imprimir fechamento do caixa: %v", err)
		}
	}(tenantID, turno.ID)

	return c.JSON(turno)
}

type MovimentacaoCaixaReq struct {
	Tipo   string  `json:"tipo"` // sangria ou suprimento
	Valor  float64 `json:"valor"`
	Motivo string  `json:"motivo"`
}

func HandleMovimentacaoCaixa(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var req MovimentacaoCaixaReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if req.Tipo != "sangria" && req.Tipo != "suprimento" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Tipo inválido"})
	}
	if req.Valor <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Valor deve ser maior que 0"})
	}

	var turno domain.CaixaTurno
	if err := db.Scopes(middleware.TenantScope(tenantID)).Where("status = ?", "aberto").First(&turno).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Nenhum caixa aberto encontrado"})
	}

	mov := domain.CaixaMovimentacao{
		TenantID:     tenantID,
		CaixaTurnoID: turno.ID,
		Tipo:         req.Tipo,
		Valor:        req.Valor,
		Motivo:       req.Motivo,
		CreatedAt:    time.Now(),
	}

	if err := db.Create(&mov).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Registrar no Financeiro
	tipoFin := "despesa"
	if req.Tipo == "suprimento" {
		tipoFin = "receita"
	}

	lancamento := domain.LancamentoFinanceiro{
		TenantID:     tenantID,
		Tipo:         tipoFin,
		Categoria:    req.Tipo,
		Descricao:    "Caixa #" + strconv.Itoa(int(turno.ID)) + " - " + req.Motivo,
		Valor:        req.Valor,
		Data:         time.Now(),
		CaixaTurnoID: &turno.ID,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	db.Create(&lancamento)

	return c.JSON(mov)
}

type EmitirFiscalReq struct {
	PedidoID uint   `json:"pedido_id"`
	CpfCnpj  string `json:"cpf_cnpj,omitempty"`
}

func HandleEmitirFiscal(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var req EmitirFiscalReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var pedido domain.Pedido
	if err := db.Scopes(middleware.TenantScope(tenantID)).First(&pedido, req.PedidoID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pedido não encontrado"})
	}

	if pedido.ChaveAcessoNfe != "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pedido já possui documento fiscal"})
	}

	// MOCK SEFAZ INTEGRATION
	// This generates a fake access key and URL
	fakeChave := "35" + time.Now().Format("0601") + "12345678000199" + "65" + "001" + "000000" + strconv.Itoa(int(pedido.ID)) + "1122334455"
	fakeUrl := "https://nfce.fazenda.sp.gov.br/consulta?chave=" + fakeChave

	pedido.CpfCnpjCliente = req.CpfCnpj
	pedido.ChaveAcessoNfe = fakeChave
	pedido.UrlCupomFiscal = fakeUrl

	db.Save(&pedido)

	return c.JSON(fiber.Map{
		"message":          "Documento emitido com sucesso (MOCK)",
		"chave_acesso_nfe": fakeChave,
		"url_cupom_fiscal": fakeUrl,
	})
}

func HandleCancelOrder(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()
	id := c.Params("id")

	// Validação de permissão
	userRole, _ := c.Locals("role").(string)
	if userRole != "admin" && userRole != "gerente" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Você não tem permissão para cancelar pedidos. Solicite a um gerente."})
	}

	var pedido domain.Pedido
	if err := db.Scopes(middleware.TenantScope(tenantID)).Preload("Itens").First(&pedido, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Pedido não encontrado"})
	}

	if pedido.Status == "cancelado" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Pedido já está cancelado"})
	}

	pedido.Status = "cancelado"
	db.Save(&pedido)

	// Estornar itens e pagamentos (se existirem) - versão simplificada
	db.Model(&domain.Pagamento{}).Where("pedido_id = ?", pedido.ID).Update("status", "estornado")
	db.Model(&domain.ItemPedido{}).Where("pedido_id = ?", pedido.ID).Update("status", "cancelado")

	return c.JSON(fiber.Map{"message": "Pedido cancelado com sucesso"})
}

func HandleGetCaixaRelatorio(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()
	idParam := c.Params("id")

	var turno domain.CaixaTurno
	if idParam == "current" {
		if err := db.Scopes(middleware.TenantScope(tenantID)).Where("status = ?", "aberto").First(&turno).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Nenhum caixa aberto encontrado"})
		}
	} else {
		id, err := strconv.Atoi(idParam)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID de turno inválido"})
		}
		if err := db.Scopes(middleware.TenantScope(tenantID)).First(&turno, id).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Turno não encontrado"})
		}
	}

	// Buscar movimentações
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

	// Buscar Vendas (Total)
	var totalVendas float64
	queryVendas := db.Model(&domain.Pedido{}).Where("tenant_id = ? AND status IN ('concluido', 'pago', 'entregue') AND updated_at >= ?", tenantID, turno.AbertoEm)
	if turno.FechadoEm != nil {
		queryVendas = queryVendas.Where("updated_at <= ?", *turno.FechadoEm)
	}
	queryVendas.Select("COALESCE(SUM(total), 0)").Scan(&totalVendas)

	// Buscar Vendas por Método de Pagamento
	// A tabela de pagamentos está ligada aos pedidos/comandas
	type MetodoTotal struct {
		Metodo string  `json:"metodo"`
		Total  float64 `json:"total"`
	}
	var vendasPorMetodo []MetodoTotal

	// Pagamentos atrelados aos pedidos deste turno
	queryPagamentos := db.Model(&domain.Pagamento{}).
		Select("metodo, COALESCE(SUM(valor), 0) as total").
		Where("tenant_id = ? AND status = 'aprovado' AND updated_at >= ?", tenantID, turno.AbertoEm)

	if turno.FechadoEm != nil {
		queryPagamentos = queryPagamentos.Where("updated_at <= ?", *turno.FechadoEm)
	}
	queryPagamentos.Group("metodo").Scan(&vendasPorMetodo)

	saldoCalculado := turno.ValorInicial + totalVendas + totalSuprimentos - totalSangrias

	return c.JSON(fiber.Map{
		"turno":             turno,
		"total_vendas":      totalVendas,
		"total_sangrias":    totalSangrias,
		"total_suprimentos": totalSuprimentos,
		"saldo_calculado":   saldoCalculado,
		"vendas_por_metodo": vendasPorMetodo,
		"movimentacoes":     movimentacoes,
	})
}

func HandleListCaixaTurnos(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var turnos []domain.CaixaTurno
	if err := db.Scopes(middleware.TenantScope(tenantID)).Order("id desc").Limit(20).Find(&turnos).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(turnos)
}
