#!/usr/bin/env bash
# ==============================================
#  Liberar Firewall - Sistema de Restaurante
#  Linux (ufw)
# ==============================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  Liberando Firewall - Sistema de Restaurante${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""

# Verificar se ufw está instalado
if ! command -v ufw &> /dev/null; then
    echo -e "${YELLOW}ufw não encontrado.${NC}"
    echo ""
    echo -e "Para permitir acesso de outros dispositivos na rede,"
    echo -e "certifique-se de que as portas 5173 e 8080 estão liberadas"
    echo -e "no firewall da sua distribuição Linux."
    echo ""
    echo -e "Alternativamente, instale o ufw:"
    echo -e "  sudo apt install ufw        # Debian/Ubuntu"
    echo -e "  sudo dnf install ufw        # Fedora"
    echo -e "  sudo pacman -S ufw          # Arch"
    exit 0
fi

# Verificar se ufw está ativo
if ! sudo ufw status | grep -q "Status: active"; then
    echo -e "${YELLOW}ufw não está ativo. As portas já estão acessíveis."
    echo -e "Nenhuma ação necessária.${NC}"
    echo ""
fi

# Obter IP local
LOCAL_IP=$(hostname -I | awk '{print $1}')

# Liberar portas
echo -e "${YELLOW}Liberando porta 5173 (Vite/React)...${NC}"
sudo ufw allow 5173/tcp 2>/dev/null && echo -e "${GREEN}  [OK] Porta 5173 liberada${NC}" || echo -e "${RED}  [ERRO] Falha ao liberar porta 5173${NC}"

echo -e "${YELLOW}Liberando porta 8080 (Backend Go)...${NC}"
sudo ufw allow 8080/tcp 2>/dev/null && echo -e "${GREEN}  [OK] Porta 8080 liberada${NC}" || echo -e "${RED}  [ERRO] Falha ao liberar porta 8080${NC}"

echo ""
echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  Acesso Wi-Fi habilitado!${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""
echo -e "  Frontend (PDV):    ${GREEN}http://${LOCAL_IP}:5173${NC}"
echo -e "  Garçom (mobile):   ${GREEN}http://${LOCAL_IP}:5173/garcom${NC}"
echo -e "  Backend API:       ${GREEN}http://${LOCAL_IP}:8080${NC}"
echo ""
