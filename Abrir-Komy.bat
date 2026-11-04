@echo off
title Komy Launcher
:: Verifica si el puerto 3000 ya está activo; si no, lo inicia en segundo plano sin ventana
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    wscript.exe "C:\Users\ASUS VIVOBOOK PRO\Documents\KomaRead\iniciar-servidor-oculto.vbs"
    timeout /t 3 /nobreak >nul
)
start "" "http://localhost:3000"
exit
