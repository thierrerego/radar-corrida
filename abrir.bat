@echo off
title Radar Corrida (feche esta janela pra desligar)
cd /d "%~dp0"
rem Puxa os dados novos que o robo guardou no GitHub (se o repo ja estiver la)
git pull --quiet 2>nul
start "" /b node servidor.mjs
timeout /t 1 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:8794"
echo.
echo Radar Corrida aberto no Chrome. Feche esta janela quando terminar.
pause >nul
