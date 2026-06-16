package database

import (
	"fmt"
	"log"
	"os"
	"time"

	"manager-restaurant/backend/internal/domain"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.Model

// GetDB returns the database instance
func GetDB() *gorm.DB {
	// Re-expose standard global or return local GORM DB
	return dbInstance
}

var dbInstance *gorm.DB

// ConnectPostgres connects to PostgreSQL database
func ConnectPostgres() *gorm.DB {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost" // Fallback to localhost if running outside Docker
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5432"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "postgres"
	}
	password := os.Getenv("DB_PASSWORD")
	if password == "" {
		password = "postgrespassword"
	}
	dbname := os.Getenv("DB_NAME")
	if dbname == "" {
		dbname = "manager_restaurant"
	}

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=America/Sao_Paulo",
		host, user, password, dbname, port)

	var err error
	config := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	// Retry connection a few times for docker startup synchronization
	for i := 0; i < 5; i++ {
		dbInstance, err = gorm.Open(postgres.Open(dsn), config)
		if err == nil {
			break
		}
		log.Printf("Failed to connect to database. Retrying in 2 seconds... (Attempt %d/5)", i+1)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}

	log.Println("Connected to PostgreSQL successfully.")
	return dbInstance
}

// AutoMigrate runs GORM migrations for all entities
func AutoMigrate(db *gorm.DB) {
	err := db.AutoMigrate(
		&domain.Empresa{},
		&domain.Usuario{},
		&domain.Restaurante{},
		&domain.Mesa{},
		&domain.Setor{},
		&domain.Categoria{},
		&domain.Produto{},
		&domain.Adicional{},
		&domain.Comanda{},
		&domain.Pedido{},
		&domain.ItemPedido{},
		&domain.Pagamento{},
		&domain.Impressora{},
		&domain.Pinpad{},
		&domain.Estoque{},
		&domain.MovimentacaoEstoque{},
		&domain.Cliente{},
		&domain.Entregador{},
		&domain.FichaTecnicaItem{},
		&domain.Fornecedor{},
		&domain.Compra{},
		&domain.CompraItem{},
		&domain.ContaPagar{},
		&domain.CaixaTurno{},
		&domain.CaixaMovimentacao{},
		&domain.LancamentoFinanceiro{},
		&domain.RolePermission{},
	)
	if err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	// Manual migration: add ip/porta columns to pinpads if they don't exist
	// (needed when upgrading from old schema)
	migratePinpadColumns(db)

	// Manual migration: fix product setor_id assignments based on categories
	migrateProductSetores(db)

	// Manual migration: seed role permissions if empty
	migrateRolePermissions(db)

	log.Println("Database migration completed successfully.")
}

// migrateRolePermissions inserts default permissions for existing tenants if the table is empty
func migrateRolePermissions(db *gorm.DB) {
	var count int64
	db.Model(&domain.RolePermission{}).Count(&count)
	if count > 0 {
		return
	}
	
	var empresas []domain.Empresa
	db.Find(&empresas)

	roles := []string{"admin", "gerente", "caixa", "garcom", "cozinha"}
	modulos := []string{"pdv_acesso", "pdv_cancelar", "caixa_sangria", "financeiro_acesso", "kds_acesso"}

	for _, empresa := range empresas {
		var permissoes []domain.RolePermission
		for _, r := range roles {
			for _, m := range modulos {
				permitido := false
				if r == "admin" || r == "gerente" {
					permitido = true
				} else if r == "caixa" && (m == "pdv_acesso" || m == "caixa_sangria" || m == "financeiro_acesso") {
					permitido = true
				} else if r == "garcom" && m == "pdv_acesso" {
					permitido = true
				} else if r == "cozinha" && m == "kds_acesso" {
					permitido = true
				}
				permissoes = append(permissoes, domain.RolePermission{
					TenantID:  empresa.ID,
					Role:      r,
					Modulo:    m,
					Permitido: permitido,
				})
			}
		}
		if len(permissoes) > 0 {
			db.Create(&permissoes)
		}
	}
}

// migratePinpadColumns adds new pinpad columns that may be missing from older schema
func migratePinpadColumns(db *gorm.DB) {
	// Only run if the pinpads table already exists (can skip on fresh installs)
	if !db.Migrator().HasTable(&domain.Pinpad{}) {
		return
	}

	type columnDef struct {
		name, sqlType, defaultVal string
	}
	columns := []columnDef{
		{"ip", "VARCHAR(45)", "'127.0.0.1'"},
		{"porta", "INT", "2001"},
		{"tipo", "VARCHAR(20)", "'tcp'"},
		{"dispositivo", "VARCHAR(255)", "''"},
		{"formato", "VARCHAR(20)", "'redondo'"},
	}

	for _, col := range columns {
		var count int64
		if err := db.Raw(
			"SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'pinpads' AND column_name = ?",
			col.name,
		).Scan(&count).Error; err != nil {
			log.Printf("Migration check for pinpads.%s skipped: %v", col.name, err)
		} else if count == 0 {
			log.Printf("Migrating: adding '%s' column to pinpads table...", col.name)
			if err := db.Exec(
				"ALTER TABLE pinpads ADD COLUMN " + col.name + " " + col.sqlType + " DEFAULT " + col.defaultVal,
			).Error; err != nil {
				log.Printf("Migration warning: failed to add pinpads.%s column: %v", col.name, err)
			}
		}
	}
}

// SeedData inserts default seed records if tables are empty
// migrateProductSetores fixes products with setor_id = 0 by mapping categories to sectors
func migrateProductSetores(db *gorm.DB) {
	// Ensure required sectors exist
	setoresNomes := []string{"Cozinha", "Bar", "Sobremesa", "Caixa"}
	for _, nome := range setoresNomes {
		var count int64
		db.Model(&domain.Setor{}).Where("nome = ?", nome).Count(&count)
		if count == 0 {
			db.Create(&domain.Setor{TenantID: 1, Nome: nome})
		}
	}

	setores := map[string]uint{}
	for _, nome := range setoresNomes {
		var setor domain.Setor
		db.Where("nome = ?", nome).First(&setor)
		if setor.ID > 0 {
			setores[nome] = setor.ID
		}
	}

	if len(setores) == 0 {
		return
	}

	categorias := map[string]uint{}
	for _, nome := range []string{"Hamburgueres", "Porcoes", "Bebidas", "Sobremesas"} {
		var cat domain.Categoria
		db.Where("nome = ?", nome).First(&cat)
		if cat.ID > 0 {
			categorias[nome] = cat.ID
		}
	}

	type mapping struct {
		categoria string
		setor     string
	}
	mappings := []mapping{
		{"Hamburgueres", "Cozinha"},
		{"Porcoes", "Cozinha"},
		{"Bebidas", "Bar"},
		{"Sobremesas", "Sobremesa"},
	}

	var fixedCount int64
	for _, m := range mappings {
		catID, hasCat := categorias[m.categoria]
		setorID, hasSetor := setores[m.setor]
		if !hasCat || !hasSetor {
			continue
		}
		result := db.Model(&domain.Produto{}).
			Where("categoria_id = ? AND setor_id = 0", catID).
			Update("setor_id", setorID)
		fixedCount += result.RowsAffected
	}

	if fixedCount > 0 {
		log.Printf("Migracao: corrigido setor_id de %d produtos (roteamento por categoria)", fixedCount)
	}
}

func SeedData(db *gorm.DB) {
	var count int64
	db.Model(&domain.Empresa{}).Count(&count)
	if count > 0 {
		return // Data already seeded
	}

	log.Println("Seeding initial database data...")

	// 1. Create Default Tenant (Empresa)
	empresa := domain.Empresa{
		Nome:     "Restaurante Sabor & Cia",
		CNPJ:     "12.345.678/0001-99",
		Telefone: "(11) 99999-8888",
		LogoURL:  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200",
		Theme:    `{"primary": "#1976d2", "secondary": "#dc004e", "dark": false}`,
	}
	db.Create(&empresa)

	// 2. Create Users (Admin, Caixa, Garçom, Cozinheiro)
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)
	passStr := string(hashedPassword)

	users := []domain.Usuario{
		{TenantID: empresa.ID, Nome: "Administrador", Email: "admin@sabor.com", SenhaHash: passStr, Role: "admin"},
		{TenantID: empresa.ID, Nome: "Caixa Principal", Email: "caixa@sabor.com", SenhaHash: passStr, Role: "caixa"},
		{TenantID: empresa.ID, Nome: "Garçom João", Email: "garcom@sabor.com", SenhaHash: passStr, Role: "garcom"},
		{TenantID: empresa.ID, Nome: "Chef Carlos", Email: "cozinha@sabor.com", SenhaHash: passStr, Role: "cozinha"},
	}
	db.Create(&users)

	// 2.1 Default Permissions
	roles := []string{"admin", "gerente", "caixa", "garcom", "cozinha"}
	modulos := []string{"pdv_acesso", "pdv_cancelar", "caixa_sangria", "financeiro_acesso", "kds_acesso"}
	var permissoes []domain.RolePermission
	for _, r := range roles {
		for _, m := range modulos {
			permitido := false
			if r == "admin" || r == "gerente" {
				permitido = true
			} else if r == "caixa" && (m == "pdv_acesso" || m == "caixa_sangria" || m == "financeiro_acesso") {
				permitido = true
			} else if r == "garcom" && m == "pdv_acesso" {
				permitido = true
			} else if r == "cozinha" && m == "kds_acesso" {
				permitido = true
			}
			permissoes = append(permissoes, domain.RolePermission{
				TenantID:  empresa.ID,
				Role:      r,
				Modulo:    m,
				Permitido: permitido,
			})
		}
	}
	db.Create(&permissoes)

	// 3. Create Sectors
	setorCozinha := domain.Setor{TenantID: empresa.ID, Nome: "Cozinha"}
	setorBar := domain.Setor{TenantID: empresa.ID, Nome: "Bar"}
	setorSobremesa := domain.Setor{TenantID: empresa.ID, Nome: "Sobremesa"}
	setorCaixa := domain.Setor{TenantID: empresa.ID, Nome: "Caixa"}
	db.Create(&setorCozinha)
	db.Create(&setorBar)
	db.Create(&setorSobremesa)
	db.Create(&setorCaixa)

	// 4. Create Printers
	printers := []domain.Impressora{
		{TenantID: empresa.ID, Nome: "Impressora Cozinha", IP: "192.168.1.100", Porta: 9100, SetorID: setorCozinha.ID},
		{TenantID: empresa.ID, Nome: "Impressora Bar", IP: "192.168.1.101", Porta: 9100, SetorID: setorBar.ID},
		{TenantID: empresa.ID, Nome: "Impressora Caixa", IP: "192.168.1.102", Porta: 9100, SetorID: setorCaixa.ID},
	}
	db.Create(&printers)

	// 4.1 Create Default Pinpads (TEF Terminals)
	// TCP mode: fallback for network-based TEF agents
	db.Create(&domain.Pinpad{
		TenantID: empresa.ID,
		Nome:     "Pinpad Caixa (TCP)",
		Modelo:   "Cielo",
		Tipo:     "tcp",
		IP:       "127.0.0.1",
		Porta:    2001,
		Serial:   "CIELO-001",
		Ativo:    false,
	})

	// Serial mode: USB pinpad (Gertec PPC930 / similar)
	db.Create(&domain.Pinpad{
		TenantID:    empresa.ID,
		Nome:        "Pinpad USB (Serial)",
		Modelo:      "Gertec PPC930",
		Tipo:        "serial",
		Dispositivo: "/dev/ttyACM0",
		Serial:      "",
		Ativo:       true,
	})

	// 5. Create Tables (1 to 15)
	for i := 1; i <= 15; i++ {
		// Define circular layout coordinates for initial map visual
		posX := 100 + (i%5)*140
		posY := 100 + (i/5)*140
		db.Create(&domain.Mesa{
			TenantID:   empresa.ID,
			Numero:     i,
			Status:     "livre",
			Capacidade: 4,
			PosX:       posX,
			PosY:       posY,
		})
	}

	// 6. Create Categories
	catBebidas := domain.Categoria{TenantID: empresa.ID, Nome: "Bebidas", Descricao: "Refrigerantes, Sucos e Cervejas"}
	catHamb := domain.Categoria{TenantID: empresa.ID, Nome: "Hambúrgueres", Descricao: "Hambúrgueres artesanais de boi, frango e vegetais"}
	catPorcoes := domain.Categoria{TenantID: empresa.ID, Nome: "Porções", Descricao: "Porções para compartilhar"}
	catSobremesas := domain.Categoria{TenantID: empresa.ID, Nome: "Sobremesas", Descricao: "Doces e sobremesas deliciosas"}
	db.Create(&catBebidas)
	db.Create(&catHamb)
	db.Create(&catPorcoes)
	db.Create(&catSobremesas)

	// 7. Create Products
	products := []domain.Produto{
		{TenantID: empresa.ID, CategoriaID: catHamb.ID, Nome: "Burger Duplo Cheddar", Descricao: "Dois blends de 150g, muito cheddar derretido e pão brioche salpicado com gergelim.", Preco: 38.90, CodigoBarras: "78910001", ImagemURL: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", Ativo: true, SetorID: setorCozinha.ID},
		{TenantID: empresa.ID, CategoriaID: catHamb.ID, Nome: "Burger Bacon Artesanal", Descricao: "Blend de 150g, fatias crocantes de bacon premium, queijo prato e molho barbecue especial.", Preco: 36.90, CodigoBarras: "78910002", ImagemURL: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400", Ativo: true, SetorID: setorCozinha.ID},
		{TenantID: empresa.ID, CategoriaID: catPorcoes.ID, Nome: "Batata Frita com Cheddar e Bacon", Descricao: "Batatas fritas sequinhas, cobertas com cheddar cremoso e farofa de bacon crocante.", Preco: 29.90, CodigoBarras: "78910003", ImagemURL: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400", Ativo: true, SetorID: setorCozinha.ID},
		{TenantID: empresa.ID, CategoriaID: catBebidas.ID, Nome: "Coca-Cola Lata 350ml", Descricao: "Refrigerante Coca-Cola original gelado.", Preco: 6.50, CodigoBarras: "78910004", ImagemURL: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400", Ativo: true, SetorID: setorBar.ID},
		{TenantID: empresa.ID, CategoriaID: catBebidas.ID, Nome: "Suco de Laranja Natural 500ml", Descricao: "Suco de laranja natural feito na hora.", Preco: 9.90, CodigoBarras: "78910005", ImagemURL: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400", Ativo: true, SetorID: setorBar.ID},
		{TenantID: empresa.ID, CategoriaID: catSobremesas.ID, Nome: "Petit Gâteau com Sorvete", Descricao: "Bolo de chocolate quente com recheio cremoso, servido com sorvete de creme e calda.", Preco: 22.90, CodigoBarras: "78910006", ImagemURL: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400", Ativo: true, SetorID: setorSobremesa.ID},
	}
	db.Create(&products)

	// 8. Create Stock Entries for Products
	for _, p := range products {
		db.Create(&domain.Estoque{
			TenantID:   empresa.ID,
			ProdutoID:  p.ID,
			Quantidade: 100,
			Minimo:     10,
			Alerta:     false,
		})
	}

	log.Println("Initial database seeding completed.")
}
