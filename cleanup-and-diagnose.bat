@echo off
echo ============================================================
echo SERVICE CLEANUP AND DIAGNOSTICS
echo ============================================================
echo.
echo This script will help diagnose and fix service issues
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

echo ============================================================
echo STEP 1: CHECKING CURRENT SERVICE STATUS
echo ============================================================
echo.

sc query ManufacturingOrchestrator
echo.

if %errorLevel% equ 0 (
    echo Service is currently installed
    echo.
    echo Do you want to REMOVE the existing service and clean up?
    echo.
    choice /C YN /M "Remove existing service"

    if errorlevel 2 (
        echo.
        echo Cancelled by user
        pause
        exit /b 0
    )

    echo.
    echo ============================================================
    echo STEP 2: STOPPING AND REMOVING SERVICE
    echo ============================================================
    echo.

    echo Stopping service...
    net stop ManufacturingOrchestrator >nul 2>&1

    echo Waiting 5 seconds...
    timeout /t 5 /nobreak >nul

    echo Attempting NSSM removal...
    if exist "%~dp0nssm\nssm.exe" (
        "%~dp0nssm\nssm.exe" remove ManufacturingOrchestrator confirm
    )

    echo Attempting SC deletion...
    sc delete ManufacturingOrchestrator

    echo Waiting 5 seconds...
    timeout /t 5 /nobreak >nul

    echo.
    echo ============================================================
    echo STEP 3: CLEANING UP OLD FILES
    echo ============================================================
    echo.

    if exist "%~dp0daemon" (
        echo Removing daemon directory...
        rmdir /s /q "%~dp0daemon"
        echo [OK] daemon directory removed
    ) else (
        echo [OK] No daemon directory found
    )

    echo.
    echo ============================================================
    echo STEP 4: VERIFICATION
    echo ============================================================
    echo.

    sc query ManufacturingOrchestrator >nul 2>&1

    if %errorLevel% equ 0 (
        echo [WARN] Service still exists! May need manual removal.
        echo.
        sc query ManufacturingOrchestrator
    ) else (
        echo [OK] Service successfully removed
    )

    echo.
    echo ============================================================
    echo CLEANUP COMPLETE
    echo ============================================================
    echo.
    echo You can now run install-service-nssm.bat to install fresh
    echo.

) else (
    echo [OK] No service currently installed
    echo.
    echo You can run install-service-nssm.bat to install the service
    echo.
)

echo.
echo ============================================================
echo DIAGNOSTICS
echo ============================================================
echo.

echo Node.js version:
node --version
echo.

echo Node.js location:
where node
echo.

echo Current directory:
echo %~dp0
echo.

echo Port 3000 status:
echo.
netstat -ano | findstr :3000
if %errorLevel% neq 0 (
    echo [OK] Port 3000 is available
) else (
    echo [WARN] Port 3000 is in use by another process
)
echo.

echo Application test:
echo.
echo Testing if the application can start manually...
echo (Will timeout after 5 seconds)
echo.

start /b node "%~dp0server.js" >nul 2>&1
timeout /t 5 /nobreak >nul

echo Checking if server started...
netstat -ano | findstr :3000 >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Application can start successfully!
    echo.
    echo Stopping test server...
    taskkill /FI "IMAGENAME eq node.exe" /F >nul 2>&1
) else (
    echo [ERROR] Application failed to start
    echo.
    echo Check server.log for errors:
    if exist "%~dp0server.log" (
        echo.
        echo Last 20 lines of server.log:
        echo ----------------------------------------
        powershell -Command "Get-Content '%~dp0server.log' -Tail 20"
    )
)

echo.
echo ============================================================
echo.
pause
