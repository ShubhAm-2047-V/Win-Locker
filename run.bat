@echo off
setlocal enabledelayedexpansion
title WinLocker - Setup & Launcher

echo ====================================================
echo             WinLocker Setup ^& Launcher
echo ====================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this PC!
    echo Please download and install Node.js from https://nodejs.org
    echo.
    pause
    start https://nodejs.org
    exit /b 1
)

:: Check if node_modules exists, otherwise install dependencies
if not exist "%~dp0node_modules" (
    echo [*] First-time setup detected. Installing required components...
    echo [*] Please wait a moment...
    cd /d "%~dp0"
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [*] Components installed successfully!
    echo.
)

:: Run the standalone installer to install app and register context menu
echo [*] Installing WinLocker application ^& registering context menu...
cd /d "%~dp0"
node install_app.js

echo.
echo ====================================================
echo WinLocker is installed ^& ready!
echo You can now delete this downloaded folder if you wish.
echo ====================================================
echo.
timeout /t 5
