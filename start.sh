#!/usr/bin/env bash
set -euo pipefail

# ==============================================
#  Manager Restaurante - Script de Inicialização
#  Linux
# ==============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  Manager Restaurante - Inicializando...${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""

# 1. Detectar Docker (com ou sem sudo)
DOCKER="docker"
if ! docker ps &>/dev/null; then
    if sudo docker ps &>/dev/null 2>&1; then
        DOCKER="sudo docker"
    else
        echo -e "${RED}[ERRO] Docker não está acessível.${NC}"
        echo ""
        echo -e "Verifique se o Docker está instalado e rodando:"
        echo -e "  sudo systemctl start docker"
        echo ""
        echo -e "Se o problema for permissão, adicione seu usuário ao grupo docker:"
        echo -e "  sudo usermod -aG docker \$USER"
        echo -e "  (depois faça logout/login para aplicar)"
        exit 1
    fi
fi

# 1. Subir PostgreSQL e Redis com Docker
echo -e "${YELLOW}[1/4] Subindo PostgreSQL e Redis com Docker...${NC}"
$DOCKER compose up -d
echo -e "${GREEN}  [OK] Containers iniciados.${NC}"
echo ""

# 2. Iniciar Backend Go
echo -e "${YELLOW}[2/4] Iniciando Backend (Go + Fiber)...${NC}"
cd backend
go run ./cmd/api/main.go > backend_run.log 2>&1 &
BACKEND_PID=$!
cd ..

echo -e "${YELLOW}  Aguardando compilação do Backend na porta 8080... (Isso pode levar alguns segundos)${NC}"
while ! nc -z localhost 8080; do
  sleep 1
done

echo -e "${GREEN}  [OK] Backend rodando na porta 8080 (PID: $BACKEND_PID).${NC}"
echo ""

# Aguardar o backend iniciar
sleep 2

# 3. Iniciar Frontend Vite
echo -e "${YELLOW}[3/4] Iniciando Frontend (React + Vite)...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..
echo -e "${GREEN}  [OK] Frontend rodando na porta 5173 (PID: $FRONTEND_PID).${NC}"
echo ""

# 4. Obter IP local
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  Sistema iniciado com sucesso!${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""
echo -e "  Frontend (PDV):    ${GREEN}http://${LOCAL_IP}:5173${NC}"
echo -e "  Garçom (mobile):   ${GREEN}http://${LOCAL_IP}:5173/garcom${NC}"
echo -e "  Backend API:       ${GREEN}http://${LOCAL_IP}:8080${NC}"
echo ""
echo -e "  Logins de teste:"
echo -e "    admin@sabor.com / 123456 (admin)"
echo -e "    caixa@sabor.com / 123456 (caixa)"
echo -e "    garcom@sabor.com / 123456 (garcom)"
echo -e "    cozinha@sabor.com / 123456 (cozinha)"
echo ""
echo -e "${YELLOW}Pressione Ctrl+C para parar todos os serviços.${NC}"

# Trap para parar todos os processos ao sair
cleanup() {
    echo ""
    echo -e "${YELLOW}Encerrando serviços...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${YELLOW}Parando containers Docker...${NC}"
    $DOCKER compose down 2>/dev/null
    echo -e "${GREEN}Serviços encerrados.${NC}"
}
trap cleanup EXIT INT TERM

# Manter o script rodando
wait
