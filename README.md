# Manager Restaurante

> Plataforma integrada de gestão para restaurantes, com PDV, KDS, mesas, estoque, pagamentos e operação em tempo real.

![Manager Restaurante — ERP, PDV, KDS e Estoque](https://github.com/betoarts/Manager-Restaurante-main/raw/main/docs/manager-restaurante-cover.jpg)

[![Go](https://img.shields.io/badge/Go-1.26.1-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=20232a)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

O **Manager Restaurante** foi projetado para centralizar a operação de restaurantes em uma única plataforma. O sistema conecta atendimento, caixa, cozinha, bar, estoque e gestão, reduzindo retrabalho e oferecendo visibilidade em tempo real sobre pedidos, mesas e vendas.

> **Status:** em desenvolvimento ativo. Antes de usar em produção, revise credenciais, integrações TEF, impressoras, regras fiscais e políticas de segurança.

## Principais recursos

- **PDV completo:** cardápio, carrinho, mesas, comandas, pedidos e múltiplos meios de pagamento.
- **Mapa interativo de mesas:** visualização por status, capacidade, formato e posicionamento drag-and-drop.
- **KDS setorizado:** telas independentes para cozinha, bar e sobremesas, com fluxo de produção e despacho.
- **Gestão de caixa:** abertura, fechamento, auditoria e bloqueio de operações quando o caixa está fechado.
- **Estoque:** saldos, estoque mínimo, ajustes manuais, movimentações e baixa automática por venda.
- **Impressão ESC/POS:** roteamento por setor, impressão TCP/USB e fallback para impressora alternativa.
- **TEF e pinpads:** suporte a comunicação serial/USB e TCP, incluindo modo simulado para desenvolvimento.
- **Dashboard gerencial:** vendas do dia, pedidos ativos, mesas ocupadas, ticket médio e produtos mais vendidos.
- **Tempo real:** WebSocket integrado ao Redis Pub/Sub para sincronização entre telas e instâncias.
- **Multiempresa:** isolamento por tenant e permissões configuráveis por função.
- **Tema por empresa:** personalização de cores e modo claro/escuro.
- **Operação mobile:** interface adaptada para garçons e dispositivos móveis.
- **Integração WhatsApp:** gerenciamento de sessão, QR Code, mensagens e status em tempo real.
- **Diretório de TI:** cadastro de infraestrutura e ativos, incluindo preenchimento por XML de notas fiscais.

## Arquitetura

```
manager-restaurante/
├── backend/
│   ├── cmd/api/main.go          # Entrypoint da API
│   ├── internal/
│   │   ├── domain/              # Modelos e regras de domínio
│   │   ├── handlers/            # Rotas e handlers HTTP
│   │   ├── services/            # Impressão, TEF e serviços de negócio
│   │   └── websocket/           # Hub de comunicação em tempo real
│   └── pkg/
│       ├── database/             # PostgreSQL, migrações e seed
│       ├── middleware/           # JWT, tenant scope e RBAC
│       └── redis/                # Conexão e Pub/Sub
├── frontend/
│   └── src/
│       ├── components/           # Componentes reutilizáveis
│       ├── pages/                # PDV, KDS, dashboard e configurações
│       ├── store/                # Estado global com Zustand
│       ├── types/                # Tipos TypeScript
│       └── utils/                # Cliente da API
├── docs/                         # Documentação e materiais do projeto
├── docker-compose.yml            # PostgreSQL 16 e Redis 7
├── start.sh                      # Inicialização rápida no Linux
├── abrir-firewall-linux.sh       # Regras de firewall para Linux
└── abrir-firewall.ps1            # Regras de firewall para Windows
```

## Stack tecnológica

| Camada | Tecnologia |
| --- | --- |
| Backend | Go 1.26.1 + Fiber v2 |
| Persistência | GORM + PostgreSQL 16 |
| Cache e eventos | Redis 7 + Redis Pub/Sub |
| Autenticação | JWT HS256 + bcrypt |
| Tempo real | WebSocket |
| Frontend | React 19 + TypeScript 6 + Vite 8 |
| Interface | Material UI 9 + Emotion |
| Estado | Zustand 5 + TanStack Query |
| Rotas | React Router 7 |
| Gráficos e animações | Recharts + Framer Motion |
| Hardware | ESC/POS, serial USB e TCP |

## Pré-requisitos

- Go 1.26.1 ou superior;
- Node.js 20 ou superior;
- npm;
- Docker e Docker Compose;
- Linux, macOS ou Windows;
- acesso de rede aos equipamentos de impressão e TEF, quando aplicável.

Para pinpads USB no Linux:

```bash
sudo usermod -aG dialout $USER
# Faça logout/login após executar o comando.
```

## Instalação e execução

### Inicialização rápida no Linux

```bash
chmod +x start.sh
./start.sh
```

O script inicia PostgreSQL e Redis via Docker, executa a API Go na porta `8080` e inicia o frontend Vite na porta `5173`.

### Execução manual

1. Suba os serviços de infraestrutura:

```bash
docker compose up -d
```

2. Instale as dependências e execute o backend:

```bash
cd backend
go mod download
go run ./cmd/api/main.go
```

3. Em outro terminal, instale as dependências e execute o frontend:

```bash
cd frontend
npm install
npm run dev
```

4. Acesse:

- Aplicação: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:8080](http://localhost:8080)
- WebSocket: `ws://localhost:8080/ws?token=<jwt>`

## Ambiente local

O `docker-compose.yml` fornece os serviços abaixo:

| Serviço | Porta | Credenciais padrão |
| --- | ---: | --- |
| PostgreSQL 16 | `5432` | usuário `postgres`, banco `manager_restaurant` |
| Redis 7 | `6379` | sem senha no ambiente local |

As credenciais padrão existem apenas para desenvolvimento. Para qualquer ambiente compartilhado ou de produção, use variáveis de ambiente e segredos fora do repositório.

### Variáveis do backend

| Variável | Padrão local | Finalidade |
| --- | --- | --- |
| `PORT` | `8080` | Porta HTTP da API |
| `DB_HOST` | `localhost` | Host do PostgreSQL |
| `DB_PORT` | `5432` | Porta do PostgreSQL |
| `DB_USER` | `postgres` | Usuário do banco |
| `DB_PASSWORD` | `postgrespassword` | Senha do banco |
| `DB_NAME` | `manager_restaurant` | Nome do banco |
| `REDIS_ADDR` | `localhost:6379` | Endereço do Redis |

### Variáveis do frontend

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `VITE_API_URL` | vazio | URL base da API; vazio usa o proxy do Vite |

## Usuários de desenvolvimento

O seed inicial cria usuários de demonstração:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@sabor.com` | `123456` |
| Caixa | `caixa@sabor.com` | `123456` |
| Garçom | `garcom@sabor.com` | `123456` |
| Cozinha | `cozinha@sabor.com` | `123456` |

Altere ou remova essas credenciais antes de disponibilizar o sistema fora do ambiente local.

## Fluxos operacionais

### Status dos pedidos

```
recebido → produzindo → pronto → despachado → entregue
```

Cada item pode ser direcionado a um setor específico. Assim, cozinha, bar e sobremesa visualizam somente o que precisam preparar.

### Eventos em tempo real

A aplicação usa Redis Pub/Sub e WebSocket para propagar eventos como:

- criação e atualização de pedidos;
- alterações no KDS;
- atualização do status das mesas;
- despacho de itens prontos;
- fechamento de mesas;
- atualização de configurações e temas.

## API

A API utiliza o prefixo `/api` e autenticação JWT. Os principais grupos de endpoints são:

| Grupo | Exemplos |
| --- | --- |
| Autenticação | `/api/auth/login`, `/api/auth/profile` |
| Mesas | `/api/tables`, `/api/tables/transfer`, `/api/tables/checkout/:id` |
| Pedidos | `/api/orders`, `/api/kds` |
| Produtos | `/api/products`, `/api/categories` |
| Caixa e pagamentos | `/api/payments`, `/api/tef/payment` |
| Estoque | `/api/stock` |
| Equipamentos | `/api/pinpads`, `/api/setores` |
| Indicadores | `/api/dashboard/stats` |
| Tempo real | `/ws?token=<jwt>` |

Consulte o código dos handlers em `backend/internal/handlers` para conferir contratos, payloads e permissões atualizados.

## Segurança e implantação

- Não use as credenciais padrão em produção.
- Não versione arquivos `.env`, tokens, chaves JWT ou credenciais de TEF.
- Coloque a API atrás de HTTPS e restrinja as portas do PostgreSQL e Redis à rede necessária.
- Troque o segredo JWT e use rotação de credenciais.
- Separe usuários de desenvolvimento, homologação e produção.
- Faça backup do PostgreSQL e valide a restauração periodicamente.
- Configure firewall conforme o ambiente usando os scripts fornecidos.
- Revise regras fiscais, integrações de pagamento e requisitos de proteção de dados antes da operação comercial.

## Scripts úteis

| Comando | Descrição |
| --- | --- |
| `docker compose up -d` | Inicia PostgreSQL e Redis |
| `docker compose down` | Para os serviços locais |
| `go run ./cmd/api/main.go` | Executa a API |
| `npm run dev` | Executa o frontend em desenvolvimento |
| `npm run build` | Gera o build de produção do frontend |
| `npm run lint` | Executa a análise estática do frontend |
| `./abrir-firewall-linux.sh` | Exibe/aplica regras de firewall no Linux |
| `.\\\\abrir-firewall.ps1` | Aplica regras de firewall no Windows |

## Contribuição

Contribuições são bem-vindas. Para colaborar:

1. Crie uma branch para sua alteração.
2. Mantenha o escopo da mudança claro.
3. Atualize a documentação quando necessário.
4. Execute lint e build antes de abrir um pull request.
5. Descreva contexto, testes realizados e possíveis impactos.

## Licença

Este projeto está distribuído sob a licença [MIT](LICENSE). Consulte o arquivo de licença para conhecer as permissões e condições de uso.

## Autor

Desenvolvido por [betoarts](https://github.com/betoarts).

