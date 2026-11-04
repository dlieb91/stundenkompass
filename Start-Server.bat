@echo off
title StundenKompass - Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js wurde nicht gefunden.
  echo   Bitte von https://nodejs.org installieren und erneut starten.
  echo.
  pause
  exit /b 1
)

if not exist "daten\team.json" (
  echo.
  echo   Noch nicht eingerichtet.
  echo   Bitte zuerst Einrichten.bat ausfuehren.
  echo.
  pause
  exit /b 1
)

node server.js
echo.
echo   Server beendet.
pause
