package domain

import (
	"time"
)

// Empresa represents the tenant (company)
type Empresa struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Nome      string    `gorm:"size:255;not null" json:"nome"`
	CNPJ      string    `gorm:"size:18;uniqueIndex" json:"cnpj"`
	Telefone  string    `gorm:"size:20" json:"telefone"`
	LogoURL   string    `gorm:"size:512" json:"logo_url"`
	Theme     string    `gorm:"type:text" json:"theme"` // JSON string for customizable UI themes
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TenantModel integrates common tenant fields
type TenantModel struct {
	TenantID uint `gorm:"not null;index" json:"tenant_id"`
}

// Usuario represents a user in the system
type Usuario struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Nome      string    `gorm:"size:255;not null" json:"nome"`
	Email     string    `gorm:"size:255;not null;uniqueIndex" json:"email"`
	SenhaHash string    `gorm:"size:255;not null" json:"-"`
	Role      string    `gorm:"size:50;default:'garcom'" json:"role"` // admin, caixa, garcom, cozinha, entregador
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RolePermission define se um cargo específico tem acesso a um módulo/ação
type RolePermission struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Role      string    `gorm:"size:50;not null;index:idx_role_modulo" json:"role"`     // ex: admin, gerente, caixa, garcom
	Modulo    string    `gorm:"size:100;not null;index:idx_role_modulo" json:"modulo"`  // ex: "pdv_acesso", "pdv_cancelar", "financeiro_acesso"
	Permitido bool      `gorm:"default:false" json:"permitido"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Restaurante represents a branch or store
type Restaurante struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Nome      string    `gorm:"size:255;not null" json:"nome"`
	Endereco  string    `gorm:"type:text" json:"endereco"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Mesa represents a dining table
type Mesa struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TenantID   uint      `gorm:"not null;index" json:"tenant_id"`
	Numero     int       `gorm:"not null" json:"numero"`
	Status     string    `gorm:"size:50;default:'livre'" json:"status"` // livre, ocupada, reservada, em_fechamento
	Capacidade int       `gorm:"default:4" json:"capacidade"`
	Formato    string    `gorm:"size:20;default:'redondo'" json:"formato"` // redondo, quadrado, retangular
	PosX       int       `gorm:"default:0" json:"pos_x"`                   // For Drag & Drop Layout
	PosY       int       `gorm:"default:0" json:"pos_y"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Setor represents the service sector (Cozinha, Bar, Caixa, etc.)
type Setor struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	TenantID     uint      `gorm:"not null;index" json:"tenant_id"`
	Nome         string    `gorm:"size:100;not null" json:"nome"`
	KdsAtivo     bool      `gorm:"default:false" json:"kds_ativo"`
	SemImpressao bool      `gorm:"default:false" json:"sem_impressao"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Categoria represents product categories
type Categoria struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Nome      string    `gorm:"size:100;not null" json:"nome"`
	Descricao string    `gorm:"size:255" json:"descricao"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Produto represents a menu item or sellable item
type Produto struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	TenantID      uint      `gorm:"not null;index" json:"tenant_id"`
	CategoriaID   uint      `gorm:"not null" json:"categoria_id"`
	Nome          string    `gorm:"size:255;not null" json:"nome"`
	Descricao     string    `gorm:"type:text" json:"descricao"`
	Preco         float64   `gorm:"type:numeric(10,2);not null" json:"preco"`
	CodigoBarras  string    `gorm:"size:100;index" json:"codigo_barras"`
	ImagemURL     string    `gorm:"size:512" json:"imagem_url"`
	Ativo         bool      `gorm:"default:true" json:"ativo"`
	SetorID       uint      `json:"setor_id"` // Sectors where this product is prepared (for printing and KDS)
	Tipo          string    `gorm:"size:50;default:'produto'" json:"tipo"` // produto, insumo
	UnidadeMedida string    `gorm:"size:20;default:'un'" json:"unidade_medida"` // un, kg, g, l, ml
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Adicional represents modifers or additions
type Adicional struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Nome      string    `gorm:"size:100;not null" json:"nome"`
	Preco     float64   `gorm:"type:numeric(10,2);default:0.00" json:"preco"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Comanda represents a tab/bill for a table or customer
type Comanda struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	MesaID    *uint     `json:"mesa_id,omitempty"` // Mesa can be null for standalone comandas
	Numero    string    `gorm:"size:50;not null" json:"numero"`
	Status    string    `gorm:"size:50;default:'aberta'" json:"status"` // aberta, fechada
	Total     float64   `gorm:"type:numeric(10,2);default:0.00" json:"total"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Pedido represents an order
type Pedido struct {
	ID              uint         `gorm:"primaryKey" json:"id"`
	TenantID        uint         `gorm:"not null;index" json:"tenant_id"`
	ComandaID       *uint        `json:"comanda_id,omitempty"`
	MesaID          *uint        `json:"mesa_id,omitempty"`
	Status          string       `gorm:"size:50;default:'recebido'" json:"status"` // recebido, produzindo, pronto, despachado, entregue
	Origem          string       `gorm:"size:50;default:'mesa'" json:"origem"`     // mesa, delivery, balcao
	Total           float64      `gorm:"type:numeric(10,2);default:0.00" json:"total"`
	ClienteID       *uint        `json:"cliente_id,omitempty"`
	EntregadorID    *uint        `json:"entregador_id,omitempty"`
	EnderecoEntrega string       `gorm:"type:text" json:"endereco_entrega,omitempty"`
	CpfCnpjCliente  string       `gorm:"size:20" json:"cpf_cnpj_cliente,omitempty"`
	ChaveAcessoNfe  string       `gorm:"size:100" json:"chave_acesso_nfe,omitempty"`
	UrlCupomFiscal  string       `gorm:"size:512" json:"url_cupom_fiscal,omitempty"`
	Itens           []ItemPedido `gorm:"foreignKey:PedidoID" json:"itens,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

// ItemPedido represents items inside an order
type ItemPedido struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	TenantID       uint      `gorm:"not null;index" json:"tenant_id"`
	PedidoID       uint      `gorm:"not null;index" json:"pedido_id"`
	ProdutoID      uint      `gorm:"not null" json:"produto_id"`
	ProdutoNome    string    `gorm:"size:255" json:"produto_nome"` // snapshot of product name at order time
	Quantidade     int       `gorm:"not null;default:1" json:"quantidade"`
	Observacao     string    `gorm:"size:255" json:"observacao"`
	PrecoUnitario  float64   `gorm:"type:numeric(10,2);not null" json:"preco_unitario"`
	Status         string    `gorm:"size:50;default:'recebido'" json:"status"` // recebido, produzindo, pronto, despachado, entregue
	Impresso       bool      `gorm:"default:false" json:"impresso"`
	SetorID        uint      `json:"setor_id"` // Route printing and KDS sector
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// Pagamento represents a transaction/payment
type Pagamento struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	TenantID      uint      `gorm:"not null;index" json:"tenant_id"`
	PedidoID      *uint     `json:"pedido_id,omitempty"`
	ComandaID     *uint     `json:"comanda_id,omitempty"`
	Metodo        string    `gorm:"size:50;not null" json:"metodo"` // pix, cartao_credito, cartao_debito, dinheiro
	Valor         float64   `gorm:"type:numeric(10,2);not null" json:"valor"`
	Status        string    `gorm:"size:50;default:'pendente'" json:"status"` // pendente, aprovado, recusado
	TransactionID string    `gorm:"size:255" json:"transaction_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Impressora represents a physical ESC/POS printer
type Impressora struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	TenantID    uint      `gorm:"not null;index" json:"tenant_id"`
	Nome        string    `gorm:"size:100;not null" json:"nome"`
	Tipo        string    `gorm:"size:10;default:'tcp'" json:"tipo"` // "tcp" (network) or "usb" (direct device)
	IP          string    `gorm:"size:45" json:"ip"`                 // Supports IPv4/IPv6 (used when tipo=tcp)
	Porta       int       `gorm:"default:9100" json:"porta"`         // TCP port (used when tipo=tcp)
	Dispositivo string    `gorm:"size:255" json:"dispositivo"`       // Device path for USB, e.g. /dev/usb/lp0
	SetorID     uint      `gorm:"not null" json:"setor_id"`          // e.g., Cozinha, Bar, Caixa
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Pinpad represents credit card terminals (Cielo, Rede, Gertec, etc.)
type Pinpad struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	TenantID    uint      `gorm:"not null;index" json:"tenant_id"`
	Nome        string    `gorm:"size:100;not null" json:"nome"`
	Modelo      string    `gorm:"size:100" json:"modelo"`       // e.g. Gertec PPC930, Cielo LIO
	Tipo        string    `gorm:"size:20;default:'tcp'" json:"tipo"` // "serial" (USB) or "tcp" (network agent)
	IP          string    `gorm:"size:45" json:"ip"`            // IP/host do agente TEF (modo tcp)
	Porta       int       `gorm:"default:2001" json:"porta"`    // Porta TCP do agente TEF
	Dispositivo string    `gorm:"size:255" json:"dispositivo"`  // Device path serial: /dev/ttyACM0, /dev/ttyUSB0
	Serial      string    `gorm:"size:100" json:"serial"`       // Número de série do terminal
	Ativo       bool      `gorm:"default:true" json:"ativo"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Estoque represents stock quantities
type Estoque struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TenantID   uint      `gorm:"not null;index" json:"tenant_id"`
	ProdutoID  uint      `gorm:"not null;uniqueIndex:idx_tenant_prod" json:"produto_id"`
	Quantidade float64   `gorm:"type:numeric(10,3);not null;default:0.000" json:"quantidade"`
	Minimo     float64   `gorm:"type:numeric(10,3);default:0.000" json:"minimo"`
	Alerta     bool      `gorm:"default:false" json:"alerta"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// FichaTecnicaItem maps product ingredients and proportions
type FichaTecnicaItem struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TenantID   uint      `gorm:"not null;index" json:"tenant_id"`
	ProdutoID  uint      `gorm:"not null;index" json:"produto_id"` // O produto final (ex: Hamburguer)
	InsumoID   uint      `gorm:"not null;index" json:"insumo_id"`  // O insumo (ex: Pao, Carne)
	Quantidade float64   `gorm:"type:numeric(10,3);not null" json:"quantidade"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	Insumo     *Produto  `gorm:"foreignKey:InsumoID" json:"insumo,omitempty"`
}

// MovimentacaoEstoque tracks stock history
type MovimentacaoEstoque struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TenantID   uint      `gorm:"not null;index" json:"tenant_id"`
	ProdutoID  uint      `gorm:"not null" json:"produto_id"`
	Quantidade float64   `gorm:"type:numeric(10,3);not null" json:"quantidade"`
	Tipo       string    `gorm:"size:10;not null" json:"tipo"` // entrada, saida
	Motivo     string    `gorm:"size:255" json:"motivo"`       // compra, desperdicio, venda
	UsuarioID  uint      `gorm:"not null" json:"usuario_id"`
	CreatedAt  time.Time `json:"created_at"`
}

// Cliente represents customer profile
type Cliente struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Nome      string    `gorm:"size:255;not null" json:"nome"`
	Telefone  string    `gorm:"size:20;index" json:"telefone"`
	Email     string    `gorm:"size:255" json:"email"`
	Endereco  string    `gorm:"type:text" json:"endereco"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Entregador represents delivery riders
type Entregador struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	TenantID     uint      `gorm:"not null;index" json:"tenant_id"`
	Nome         string    `gorm:"size:255;not null" json:"nome"`
	Telefone     string    `gorm:"size:20" json:"telefone"`
	PlacaVeiculo string    `gorm:"size:20" json:"placa_veiculo"`
	Ativo        bool      `gorm:"default:true" json:"ativo"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Fornecedor represents a supplier
type Fornecedor struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TenantID  uint      `gorm:"not null;index" json:"tenant_id"`
	Nome      string    `gorm:"size:255;not null" json:"nome"`
	CNPJ      string    `gorm:"size:20" json:"cnpj"`
	Telefone  string    `gorm:"size:20" json:"telefone"`
	Email     string    `gorm:"size:255" json:"email"`
	Ativo     bool      `gorm:"default:true" json:"ativo"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Compra represents a purchase/Nota Fiscal
type Compra struct {
	ID           uint          `gorm:"primaryKey" json:"id"`
	TenantID     uint          `gorm:"not null;index" json:"tenant_id"`
	FornecedorID uint          `gorm:"not null" json:"fornecedor_id"`
	NumeroNF     string        `gorm:"size:50" json:"numero_nf"`
	DataCompra   time.Time     `gorm:"not null" json:"data_compra"`
	ValorTotal   float64       `gorm:"type:numeric(10,2);not null" json:"valor_total"`
	Status       string        `gorm:"size:50;default:'recebida'" json:"status"` // recebida, cancelada
	Itens        []CompraItem  `gorm:"foreignKey:CompraID" json:"itens,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
	Fornecedor   *Fornecedor   `gorm:"foreignKey:FornecedorID" json:"fornecedor,omitempty"`
}

// CompraItem represents the ingredients/products bought
type CompraItem struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CompraID   uint      `gorm:"not null;index;constraint:OnDelete:CASCADE;" json:"compra_id"`
	ProdutoID  uint      `gorm:"not null" json:"produto_id"` // This is the insumo
	Quantidade float64   `gorm:"type:numeric(10,3);not null" json:"quantidade"`
	CustoUnid  float64   `gorm:"type:numeric(10,2);not null" json:"custo_unitario"` // Cost per unit/kg/etc
	Subtotal   float64   `gorm:"type:numeric(10,2);not null" json:"subtotal"`
	Produto    *Produto  `gorm:"foreignKey:ProdutoID" json:"produto,omitempty"`
}

// ContaPagar represents financial liability created by a purchase
type ContaPagar struct {
	ID             uint        `gorm:"primaryKey" json:"id"`
	TenantID       uint        `gorm:"not null;index" json:"tenant_id"`
	FornecedorID   *uint       `json:"fornecedor_id"`
	CompraID       *uint       `json:"compra_id"` // Optional link to the purchase
	Descricao      string      `gorm:"size:255;not null" json:"descricao"`
	Valor          float64     `gorm:"type:numeric(10,2);not null" json:"valor"`
	DataVencimento time.Time   `gorm:"not null" json:"data_vencimento"`
	Status         string      `gorm:"size:50;default:'pendente'" json:"status"` // pendente, paga, cancelada
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
	Fornecedor     *Fornecedor `gorm:"foreignKey:FornecedorID" json:"fornecedor,omitempty"`
}

// CaixaTurno represents an open cash register session
type CaixaTurno struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	TenantID     uint       `gorm:"not null;index" json:"tenant_id"`
	UsuarioID    uint       `gorm:"not null" json:"usuario_id"`
	Status       string     `gorm:"size:50;default:'aberto'" json:"status"` // aberto, fechado
	ValorInicial float64    `gorm:"type:numeric(10,2);not null;default:0.00" json:"valor_inicial"`
	ValorFinal   float64    `gorm:"type:numeric(10,2);default:0.00" json:"valor_final"`
	AbertoEm     time.Time  `json:"aberto_em"`
	FechadoEm    *time.Time   `json:"fechado_em"`
	Tenant       *TenantModel `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

// CaixaMovimentacao represents a cash register operation (sangria, suprimento)
type CaixaMovimentacao struct {
	ID           uint        `gorm:"primaryKey" json:"id"`
	TenantID     uint        `gorm:"not null;index" json:"tenant_id"`
	CaixaTurnoID uint        `gorm:"not null" json:"caixa_turno_id"`
	Tipo         string      `gorm:"size:50;not null" json:"tipo"` // sangria, suprimento
	Valor        float64     `gorm:"type:numeric(10,2);not null" json:"valor"`
	Motivo       string      `gorm:"size:255" json:"motivo"`
	CreatedAt    time.Time   `json:"created_at"`
	CaixaTurno   *CaixaTurno `gorm:"foreignKey:CaixaTurnoID" json:"caixa_turno,omitempty"`
}

// LancamentoFinanceiro represents the unified cash flow for the module Financeiro
type LancamentoFinanceiro struct {
	ID           uint        `gorm:"primaryKey" json:"id"`
	TenantID     uint        `gorm:"not null;index" json:"tenant_id"`
	Tipo         string      `gorm:"size:20;not null" json:"tipo"` // "receita" or "despesa"
	Categoria    string      `gorm:"size:100;not null" json:"categoria"` // "venda_pdv", "abertura_caixa", "sangria", "suprimento", "conta_pagar", etc
	Descricao    string      `gorm:"size:255;not null" json:"descricao"`
	Valor        float64     `gorm:"type:numeric(10,2);not null" json:"valor"`
	Data         time.Time   `gorm:"not null" json:"data"`
	CaixaTurnoID *uint       `json:"caixa_turno_id,omitempty"` // Relates to the Caixa Turno if it's from PDV
	ContaPagarID *uint       `json:"conta_pagar_id,omitempty"` // Relates to a Conta a Pagar if it's from supply
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
	CaixaTurno   *CaixaTurno `gorm:"foreignKey:CaixaTurnoID" json:"caixa_turno,omitempty"`
	ContaPagar   *ContaPagar `gorm:"foreignKey:ContaPagarID" json:"conta_pagar,omitempty"`
}
