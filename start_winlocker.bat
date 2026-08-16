@echo off
title WinLocker - Stealth Vault
echo Starting WinLocker...
cd /d "%~dp0"
npm start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Launching with npx...
    npx electron .
)
pause
