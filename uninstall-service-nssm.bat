@echo off
cd /d "%~dp0"

echo ============================================================
echo MANUFACTURING ORCHESTRATOR - UNINSTALL NSSM SERVICE
echo ============================================================
echo.

REM Check for admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [OK] Running with Administrator privileges
echo.

REM Set NSSM variables
set "NSSM_DIR=%~dp0nssm"
set "NSSM_EXE=%NSSM_DIR%\nssm.exe"

REM Check for nssm in PATH first
where nssm >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%i in ('where nssm') do set NSSM_EXE=%%i
    echo [OK] Found nssm.exe in PATH: %NSSM_EXE%
    goto :nssm_ready
)

REM Check for nssm in local directory
if exist "%NSSM_EXE%" (
    echo [OK] Found nssm.exe in local directory: %NSSM_EXE%
    goto :nssm_ready
)

REM nssm not found
echo ERROR: nssm.exe not found!
echo.
echo Searched:
echo   - System PATH
echo   - Local directory: %NSSM_DIR%
echo.
echo Cannot uninstall without nssm.
echo.
echo Options:
echo   1. Run install-service-nssm.bat to download nssm
echo   2. Manually remove service via services.msc
echo.
pause
exit /b 1

:nssm_ready
echo [OK] Using nssm: %NSSM_EXE%
echo.

REM Check if service exists
"%NSSM_EXE%" status ManufacturingOrchestrator >nul 2>&1
if %errorLevel% neq 0 (
    echo Service "ManufacturingOrchestrator" is not installed.
    echo Nothing to uninstall.
    echo.
    pause
    exit /b 0
)

echo Found service: ManufacturingOrchestrator
echo.
echo This will:
echo   1. Stop the service (if running)
echo   2. Remove the service
echo   3. Configuration and logs will NOT be deleted
echo.
pause

echo.
echo [1/2] Stopping service...
"%NSSM_EXE%" stop ManufacturingOrchestrator
timeout /t 3 /nobreak >nul

echo [2/2] Removing service...
"%NSSM_EXE%" remove ManufacturingOrchestrator confirm

if %errorLevel% equ 0 (
    echo.
    echo ============================================================
    echo SERVICE UNINSTALLED SUCCESSFULLY
    echo ============================================================
    echo.
    echo The service has been removed.
    echo.
    echo Note: Configuration files and logs were NOT deleted.
    echo.
    echo To reinstall:
    echo   - Run: install-service-nssm.bat
    echo.
) else (
    echo.
    echo ============================================================
    echo ERROR DURING UNINSTALL
    echo ============================================================
    echo.
    echo The service may not have been removed completely.
    echo Please check services.msc manually.
    echo.
)

pause
