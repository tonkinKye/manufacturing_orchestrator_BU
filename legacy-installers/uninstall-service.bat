@echo off
REM ============================================================================
REM Manufacturing Orchestrator - Service Uninstallation Script
REM ============================================================================

REM CRITICAL: Change to the directory where this script is located
cd /d "%~dp0"

echo.
echo ============================================================
echo MANUFACTURING ORCHESTRATOR - UNINSTALL SERVICE
echo ============================================================
echo.
echo Working Directory: %CD%
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [OK] Running with Administrator privileges
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Cannot uninstall service without Node.js
    echo.
    pause
    exit /b 1
)

echo Uninstalling Manufacturing Orchestrator service...
echo Please wait...
echo.

node uninstall-windows-service.js
if %errorLevel% neq 0 (
    echo [ERROR] Failed to uninstall service!
    echo.
    echo The service may not be installed.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo SERVICE UNINSTALLED SUCCESSFULLY
echo ============================================================
echo.
echo Note: Configuration files and logs were NOT deleted.
echo.
echo To reinstall:
echo   - Run: install-service.bat
echo.
pause
