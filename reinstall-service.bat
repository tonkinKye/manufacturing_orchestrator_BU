@echo off
cd /d "%~dp0"

echo ============================================================
echo REINSTALLING MANUFACTURING ORCHESTRATOR WINDOWS SERVICE
echo ============================================================
echo.
echo Working Directory: %CD%
echo.
echo This will:
echo   1. Uninstall the current service
echo   2. Wait 5 seconds
echo   3. Reinstall the service with updated configuration
echo.
pause

echo.
echo [1/3] Uninstalling current service...
node "%~dp0uninstall-windows-service.js"
if %errorlevel% neq 0 (
    echo ERROR: Failed to uninstall service
    pause
    exit /b 1
)

echo.
echo [2/3] Waiting 5 seconds for service to fully uninstall...
timeout /t 5 /nobreak

echo.
echo [3/3] Installing service with updated configuration...
node "%~dp0install-windows-service.js"
if %errorlevel% neq 0 (
    echo ERROR: Failed to install service
    pause
    exit /b 1
)

echo.
echo ============================================================
echo SERVICE REINSTALLED SUCCESSFULLY
echo ============================================================
echo.
echo The service has been reinstalled with:
echo   - Graceful shutdown support (up to 120 seconds)
echo   - Windows signal handling (SIGBREAK)
echo   - Session preservation for pending jobs
echo.
pause
