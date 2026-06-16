# Manager Restaurante — ERP & PDV SaaS

Sistema completo de gestão para restaurantes com PDV (Ponto de Venda), KDS (Kitchen Display System) setorizado, controle de mesas com mapa interativo, integração TEF/Pinpad, estoque e impressão ESC/POS.

## Arquitetura

```
manager-restaurante/
├── backend/                  # API Go + Fiber
│   ├── cmd/api/main.go       # Entrypoint do servidor
│   ├── internal/
│   │   ├── domain/models.go  # Modelos GORM (18 entidades)
│   │   ├── handlers/         # Handlers HTTP (auth, mesas, pedidos, pagamentos, produtos, pinpad, etc.)
│   │   ├── services/         # Serviços: impressão ESC/POS, pinpad TEF serial/TCP
│   │   └── websocket/        # Hub WebSocket com Redis Pub/Sub
│   └── pkg/
│       ├── database/         # Conexão PostgreSQL + AutoMigrate + Migrações + Seed
│       ├── middleware/        # JWT Auth + Tenant Scope + RBAC
│       └── redis/            # Conexão Redis
├── frontend/                 # React 19 + TypeScript + Vite
│   └── src/
│       ├── components/       # Layout com drawer responsivo
│       ├── pages/            # Dashboard, PDV, KDS, Estoque, Config, GarcomMobile
│       ├── store/            # Zustand (auth, cart, mesas, KDS, WebSocket)
│       ├── types/            # Tipos TypeScript
│       └── utils/            # API client com proxy Vite
├── start.sh                  # Script de inicialização rápida (Linux)
├── abrir-firewall-linux.sh   # Liberar portas no firewall (ufw)
├── abrir-firewall.ps1        # Liberar portas no firewall (Windows)
└── docker-compose.yml        # PostgreSQL 16 + Redis 7
```

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Backend | Go 1.26 + Fiber v2 |
| ORM | GORM + PostgreSQL 16 |
| Cache/PubSub | Redis 7 |
| Autenticação | JWT (HS256) + bcrypt |
| Tempo real | WebSocket + Redis Pub/Sub |
| Serial/USB | go.bug.st/serial.v1 |
| Frontend | React 19 + TypeScript 6 |
| UI Framework | Material UI v9 + Emotion |
| Estado global | Zustand v5 |
| Roteamento | React Router v7 |
| Gráficos | Recharts |
| Animações | Framer Motion |
| Build | Vite 8 |

## Pré-requisitos

- [Go](https://go.dev/dl/) 1.26+
- [Node.js](https://nodejs.org/) 20+
- [Docker](https://docs.docker.com/engine/install/) e [Docker Compose](https://docs.docker.com/compose/install/) (para PostgreSQL e Redis)
  - Linux: instale via `sudo apt install docker.io docker-compose-v2` (Ubuntu/Debian) ou equivalente na sua distro

### Permissões para Pinpad USB (Linux)

Se estiver usando um pinpad Gertec PPC930 ou similar via USB:

```bash
# Adicionar usuário ao grupo dialout
sudo usermod -aG dialout $USER

# Ou liberar o dispositivo diretamente
sudo chmod 666 /dev/ttyACM0
```

## Como Executar

### Opção Rápida: Script de Inicialização (Linux)

```bash
./start.sh
```

Este script sobe **todos os serviços** automaticamente: Docker (PostgreSQL + Redis), Backend Go e Frontend Vite. Pressione `Ctrl+C` para encerrar tudo.

### Passo a passo manual

#### 1. Subir banco de dados e cache

```bash
docker compose up -d
```

Isso sobe:
- **PostgreSQL 16** na porta `5432` (user: `postgres`, senha: `postgrespassword`, db: `manager_restaurant`)
- **Redis 7** na porta `6379`

#### 2. Iniciar o backend

```bash
cd backend
go run ./cmd/api/main.go
```

O servidor inicia na porta `8080` e executa:
- Conexão com PostgreSQL (com 5 tentativas de retry)
- AutoMigrate (cria/atualiza todas as tabelas e colunas via migração manual)
- Seed de dados iniciais (empresa, usuários, mesas, produtos, categorias, setores, impressoras, pinpads)
- Conexão com Redis
- Inicialização do Hub WebSocket

#### 3. Iniciar o frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend inicia em `http://localhost:5173` com proxy para o backend:
- `/api` → `http://localhost:8080`
- `/ws` → `ws://localhost:8080`

#### 4. Acessar

Abra `http://localhost:5173` e faça login com os dados de seed:

| Email | Senha | Role |
|-------|-------|------|
| admin@sabor.com | 123456 | admin |
| caixa@sabor.com | 123456 | caixa |
| garcom@sabor.com | 123456 | garcom |
| cozinha@sabor.com | 123456 | cozinha |

## Dados de Seed

O seed inicial cria automaticamente:
- **Empresa**: Restaurante Sabor & Cia
- **4 usuários**: admin, caixa, garçom, cozinha
- **4 setores**: Cozinha, Bar, Sobremesa, Caixa
- **3 impressoras**: uma por setor (IPs mock `192.168.1.x`)
- **2 pinpads**: TCP (Cielo) e Serial USB (Gertec PPC930)
- **15 mesas**: numeradas de 1 a 15, status `livre`
- **4 categorias**: Bebidas, Hambúrgueres, Porções, Sobremesas
- **6 produtos**: burgers, batata frita, bebidas, sobremesa (com SetorID para roteamento KDS)
- **Estoque**: 100 unidades por produto, mínimo de 10

## Funcionalidades

### Autenticação e Multi-Tenant

- JWT com claims `user_id`, `tenant_id` e `role`
- Middleware `RequireAuth` protege rotas da API
- Middleware `RequireRole` para RBAC (admin, caixa, garcom, cozinha, entregador)
- `TenantScope` no GORM isola dados entre empresas

### PDV (Ponto de Venda)

- **Mapa de mesas integrado**: toggle entre cardápio e mapa interativo
- **Drag & drop** para reposicionar mesas no mapa (admin/gerente)
- **Criar/editar/excluir mesas** direto no mapa (admin/gerente)
- Mesas coloridas por status: verde (livre), amarelo (ocupada), azul (reservada), vermelho (fechamento)
- Formatos visuais: redondo (círculo) ou quadrado
- Carrinho de compras com seleção de mesa/comanda
- Busca de produtos por código de barras
- Criação de pedidos com dedução automática de estoque
- Múltiplos métodos de pagamento: PIX, cartão de crédito/débito, dinheiro
- **Fechamento de mesa direto do PDV**: botão "Fechar Mesa" na visão de consumo
- **Transferência de mesa**: mover consumo entre mesas disponíveis
- Integração com **TEF/Pinpad Cielo** para pagamentos com cartão

### Mapa de Mesas

- Visualização drag-and-drop com posições customizáveis (pos_x, pos_y)
- Status visuais: livre, ocupada, reservada, em_fechamento
- Criação/edição/exclusão de mesas por admin/gerente
- Edição de capacidade e formato (redondo/quadrado)
- Transferência total de itens entre mesas
- Fechamento de mesa com fluxo completo de pagamento

### Gerenciamento de Produtos

- CRUD completo de produtos em **Configurações > Produtos**
- Ativar/desativar produtos (soft-delete, preserva histórico)
- Upload de imagem por URL
- Código de barras, categoria, preço
- Busca integrada por nome
- Gerenciamento de categorias com chips interativos

### KDS (Kitchen Display System) Setorizado

- **3 setores independentes**: Cozinha, Bar, Sobremesa
- Cada aba mostra apenas os itens do seu setor
- Badge com contagem de pedidos pendentes por setor
- Pedidos com itens de múltiplos setores aparecem em cada aba relevante
- Fluxo de status: `recebido` → `produzindo` → `pronto` → `despachado`
- Despacho da cozinha notifica o garçom via WebSocket
- Atualização em tempo real via WebSocket
- Setores padrão automáticos (fallback se API indisponível)

### Integração TEF / Pinpad Cielo

- **Suporte USB/Serial**: Gertec PPC930 (`/dev/ttyACM0`), comunicação via protocolo serial
- **Suporte TCP**: Agente TEF Cielo (localhost:2001)
- **Detecção automática**: Escaneia `/dev/ttyACM*`, `/dev/ttyUSB*`, `/dev/serial/by-id/usb-GERTEC*`
- **Auto-criação**: Se nenhum pinpad configurado, cria um automaticamente
- Configuração em **Configurações > Terminais TEF (Pinpad)**
- Teste de conexão com feedback visual (online/offline)
- Pagamento via TEF no PDV: PIX e cartão
- Fallback de simulação para desenvolvimento (flag `simulated: true`)

### Controle de Estoque

- Visualização de quantidade, mínimo e alertas
- Ajuste manual com registro de movimentação (entrada/saída)
- Motivos: inventário, ajuste, desperdício, compra, venda
- Dedução automática ao criar pedidos

### Impressão ESC/POS

- Roteamento de itens do pedido por setor (cozinha, bar, caixa)
- Comandos ESC/POS: bold, double height, alinhamento, corte de papel
- Envio via TCP para impressoras térmicas na rede
- Fallback para console quando impressora não configurada
- Impressão de pré-conta no fechamento de mesa

### Dashboard

- Vendas do dia
- Pedidos ativos
- Mesas ocupadas
- Ticket médio
- Top 5 produtos mais vendidos
- Vendas por hora (gráfico)

### Tempo Real (WebSocket)

- Canal Redis Pub/Sub `restaurant_realtime` para sincronização multi-instância
- Eventos: `order_created`, `order_updated`, `kds_updated`, `table_updated`, `order_ready_dispatch`, `table_checkout_done`, `settings_updated`
- Reconexão automática com retry a cada 5 segundos
- Indicador visual de conexão no frontend

### Tema Customizável

- Cores primária/secundária e modo dark/light por tenant
- Persistido no backend e propagado via WebSocket para todos os clientes

### Garçom Mobile

- Interface otimizada para dispositivos móveis
- Notificação de pedidos prontos para retirada no balcão

## API Endpoints

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login (retorna JWT + usuário + empresa) |
| GET | `/api/auth/profile` | Perfil do usuário autenticado |
| PUT | `/api/auth/tenant` | Atualizar configurações da empresa (tema) |

### Mesas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/tables` | Listar mesas |
| POST | `/api/tables` | Criar mesa (admin/gerente) |
| PUT | `/api/tables/:id` | Atualizar mesa (status, posição, capacidade, formato) |
| DELETE | `/api/tables/:id` | Excluir mesa livre (admin/gerente) |
| GET | `/api/tables/:id/orders` | Listar pedidos ativos da mesa |
| POST | `/api/tables/transfer` | Transferir itens entre mesas |
| POST | `/api/tables/close/:id` | Solicitar fechamento de mesa |
| POST | `/api/tables/checkout/:id` | Finalizar checkout (libera mesa) |

### Usuários

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/users` | Listar usuários |
| POST | `/api/users` | Criar usuário |
| PUT | `/api/users/:id` | Atualizar usuário |
| DELETE | `/api/users/:id` | Remover usuário |

### Produtos e Categorias

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/products` | Listar produtos ativos (`?all=1` inclui inativos) |
| POST | `/api/products` | Criar produto |
| PUT | `/api/products/:id` | Atualizar produto (inclui ativo/inativo) |
| DELETE | `/api/products/:id` | Desativar produto (soft-delete) |
| GET | `/api/categories` | Listar categorias |
| POST | `/api/categories` | Criar categoria |
| PUT | `/api/categories/:id` | Atualizar categoria |
| DELETE | `/api/categories/:id` | Excluir categoria |

### Pinpad / TEF

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/pinpads` | Listar pinpads |
| POST | `/api/pinpads` | Registrar pinpad (serial ou TCP) |
| PUT | `/api/pinpads/:id` | Atualizar configuração do pinpad |
| DELETE | `/api/pinpads/:id` | Remover pinpad |
| GET | `/api/pinpads/:id/detect` | Testar conexão com o pinpad |
| POST | `/api/tef/payment` | Processar pagamento via TEF |

### Setores

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/setores` | Listar setores (Cozinha, Bar, Sobremesa, etc.) |

### Pedidos e KDS

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/orders` | Criar pedido |
| GET | `/api/orders` | Listar pedidos |
| PUT | `/api/orders/:id` | Atualizar status do pedido |
| GET | `/api/kds` | Pedidos ativos para KDS (`?setor_id=X` filtra por setor) |

### Pagamentos

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/payments` | Processar pagamento |

### Dashboard

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/dashboard/stats` | Estatísticas (vendas, ticket médio, top produtos) |

### Estoque

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/stock` | Listar estoque |
| PUT | `/api/stock/:id` | Ajustar quantidade |

### WebSocket

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ws?token=<jwt>` | Conexão WebSocket (autenticada via query param) |

## Modelos de Dados

### Entidades Principais

| Entidade | Descrição |
|----------|-----------|
| Empresa | Tenant (restaurante) com tema customizável |
| Usuario | Operador com role (admin, caixa, garcom, cozinha, entregador) |
| Mesa | Mesa física com posição (x, y), capacidade, formato e status |
| Setor | Área de preparo: Cozinha, Bar, Sobremesa, Caixa |
| Produto | Item do cardápio vinculado a categoria e setor |
| Categoria | Agrupamento de produtos (Bebidas, Hamburgueres, etc.) |
| Pedido | Ordem de venda com itens e status |
| ItemPedido | Item individual dentro de um pedido, roteado por setor |
| Comanda | Tab/conta associada a uma mesa |
| Pagamento | Transação financeira |
| Pinpad | Terminal TEF (serial USB ou TCP) |
| Estoque | Quantidade em estoque por produto |
| Impressora | Impressora térmica ESC/POS por setor |

### Fluxo de Status do Pedido

```
recebido → produzindo → pronto → despachado (cozinha) → entregue (caixa/checkout)
```

- `recebido`: Pedido criado, aguardando cozinha
- `produzindo`: Cozinha iniciou preparo
- `pronto`: Item finalizado, aguardando despacho
- `despachado`: Saiu da cozinha, disponível no balcão (notifica garçom)
- `entregue`: Cliente recebeu / mesa fechada

### Roteamento KDS por Setor

Cada produto tem um `SetorID` que determina para qual tela do KDS o item é enviado:

| Setor | Produtos típicos | Cor KDS |
|-------|-----------------|---------|
| Cozinha | Hamburgueres, porções, batatas | Vermelho |
| Bar | Bebidas, refrigerantes, sucos | Azul |
| Sobremesa | Doces, sobremesas | Amarelo |

## Variáveis de Ambiente

### Backend

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `8080` | Porta do servidor HTTP |
| `DB_HOST` | `localhost` | Host do PostgreSQL |
| `DB_PORT` | `5432` | Porta do PostgreSQL |
| `DB_USER` | `postgres` | Usuário do PostgreSQL |
| `DB_PASSWORD` | `postgrespassword` | Senha do PostgreSQL |
| `DB_NAME` | `manager_restaurant` | Nome do banco |
| `REDIS_ADDR` | `localhost:6379` | Endereço do Redis |

### Frontend

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `VITE_API_URL` | (vazio) | URL base da API (usa proxy Vite por padrão) |

## Acesso Remoto na Rede Local

O frontend escuta em `0.0.0.0:5173`, permitindo acesso de dispositivos na mesma rede (tablets, celulares).

### Linux

```bash
# Se estiver usando ufw (Ubuntu/Debian):
./abrir-firewall-linux.sh

# Ou manualmente:
sudo ufw allow 5173/tcp
sudo ufw allow 8080/tcp
```

Caso sua distribuição não use `ufw` (Arch, openSUSE, etc.), execute o script para instruções ou configure o firewall equivalente (`iptables`, `firewalld`, `nftables`).

### Windows

Para liberar no firewall do Windows, execute como administrador:

```powershell
.\abrir-firewall.ps1
```

Ou execute o arquivo `.bat` com botão direito → "Executar como administrador".
