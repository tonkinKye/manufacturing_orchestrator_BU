@echo off
echo ============================================================
echo UNINSTALL MANUFACTURING ORCHESTRATOR SERVICE (NSSM)
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

cd /d "%~dp0"

REM Find NSSM
set "NSSM_EXE=%~dp0nssm\nssm.exe"

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

echo [ERROR] nssm.exe not found!
echo.
echo Please install nssm first or specify the path.
echo Download from: https://nssm.cc/download
echo.
pause
exit /b 1

:nssm_ready

echo Checking service status...
echo.

"%NSSM_EXE%" status ManufacturingOrchestrator >nul 2>&1

if %errorLevel% neq 0 (
    echo [INFO] Service 'ManufacturingOrchestrator' is not installed
    echo.
    echo Checking if service exists with sc...
    sc query ManufacturingOrchestrator >nul 2>&1

    if %errorLevel% equ 0 (
        echo [WARN] Service exists but not managed by NSSM
        echo.
        echo Do you want to delete it with SC?
        choice /C YN /M "Delete service with SC"

        if errorlevel 2 goto :end

        echo.
        echo Stopping service...
        net stop ManufacturingOrchestrator >nul 2>&1

        echo Deleting service...
        sc delete ManufacturingOrchestrator

        if %errorLevel% equ 0 (
            echo [OK] Service deleted
        ) else (
            echo [ERROR] Failed to delete service
        )
    ) else (
        echo [OK] No service found to uninstall
    )

    goto :end
)

echo Service is currently installed
echo.
sc query ManufacturingOrchestrator
echo.

echo This will STOP and REMOVE the ManufacturingOrchestrator service
echo.
choice /C YN /M "Continue with uninstall"

if errorlevel 2 (
    echo.
    echo Cancelled by user
    goto :end
)

echo.
echo [1/3] Stopping service...
"%NSSM_EXE%" stop ManufacturingOrchestrator

if %errorLevel% equ 0 (
    echo [OK] Service stopped
) else (
    echo [WARN] Service may already be stopped
)

echo.
echo [2/3] Waiting 5 seconds...
timeout /t 5 /nobreak >nul

echo.
echo [3/3] Removing service...
"%NSSM_EXE%" remove ManufacturingOrchestrator confirm

if %errorLevel% equ 0 (
    echo [OK] Service removed successfully
) else (
    echo [ERROR] Failed to remove service
    echo.
    echo Trying with sc delete...
    sc delete ManufacturingOrchestrator
)

echo.
echo Verifying removal...
"%NSSM_EXE%" status ManufacturingOrchestrator >nul 2>&1

if %errorLevel% equ 0 (
    echo [WARN] Service still exists!
    echo.
    sc query ManufacturingOrchestrator
) else (
    echo [OK] Service successfully uninstalled
)

echo.
echo ============================================================
echo UNINSTALL COMPLETE
echo ============================================================
echo.

:end
echo Note: This does NOT remove:
echo   - Application files
echo   - Log files (server.log)
echo   - Configuration files (config.json)
echo   - Database data (mo_queue table)
echo.
echo To reinstall, run: install-service-nssm.bat
echo.
pause
