# Abrir portas do Firewall para o sistema de restaurante
# Execute este script como Administrador

Write-Host "Abrindo portas no Firewall do Windows..." -ForegroundColor Cyan

# Remove regras antigas se existirem
netsh advfirewall firewall delete rule name="Vite Dev Server 5173" | Out-Null
netsh advfirewall firewall delete rule name="Restaurant Backend 8080" | Out-Null

# Porta 5173 - React/Vite (Frontend)
netsh advfirewall firewall add rule name="Vite Dev Server 5173" dir=in action=allow protocol=TCP localport=5173 profile=private,domain
Write-Host "  [OK] Porta 5173 (Vite/React) liberada" -ForegroundColor Green

# Porta 8080 - Go Backend (API + WebSocket)
netsh advfirewall firewall add rule name="Restaurant Backend 8080" dir=in action=allow protocol=TCP localport=8080 profile=private,domain
Write-Host "  [OK] Porta 8080 (Backend Go) liberada" -ForegroundColor Green

# Mostra o IP da rede Wi-Fi
$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" } | Select-Object -First 1 -ExpandProperty IPAddress
Write-Host ""
Write-Host "=======================================" -ForegroundColor Yellow
Write-Host "  Acesso pela rede local habilitado!   " -ForegroundColor Yellow
Write-Host "=======================================" -ForegroundColor Yellow
Write-Host "  Frontend (Garcom): http://${ip}:5173/garcom" -ForegroundColor Cyan
Write-Host "  Frontend (PDV):    http://${ip}:5173"         -ForegroundColor Cyan
Write-Host "  Backend API:       http://${ip}:8080"         -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
