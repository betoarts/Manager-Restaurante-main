@echo off
echo ================================================
echo  Liberando Firewall - Sistema de Restaurante
echo ================================================
echo.

netsh advfirewall firewall delete rule name="Vite Dev Server 5173" >nul 2>&1
netsh advfirewall firewall delete rule name="Restaurant Backend 8080" >nul 2>&1

netsh advfirewall firewall add rule name="Vite Dev Server 5173" dir=in action=allow protocol=TCP localport=5173 profile=private,domain
netsh advfirewall firewall add rule name="Restaurant Backend 8080" dir=in action=allow protocol=TCP localport=8080 profile=private,domain

echo.
echo ================================================
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i "IPv4" ^| findstr "192.168"') do set IP=%%A
set IP=%IP:~1%
echo  Acesso Wi-Fi habilitado!
echo.
echo  Garcom (celular):  http://%IP%:5173/garcom
echo  PDV (computador):  http://%IP%:5173
echo  Backend API:       http://%IP%:8080
echo ================================================
echo.
pause
