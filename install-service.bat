@echo off
REM ============================================================================
REM Manufacturing Orchestrator - Bootstrapper Installer
REM ============================================================================
REM This installer will:
REM   1. Self-elevate to Administrator
REM   2. Check for Node.js
REM   3. Auto-download and install Node.js LTS if missing
REM   4. Install application dependencies
REM   5. Register Windows Service
REM ============================================================================

setlocal enabledelayedexpansion

REM ============================================================================
REM STEP 1: Self-Elevate to Administrator
REM ============================================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

REM ============================================================================
REM STEP 2: Change to Script Directory
REM ============================================================================

cd /d "%~dp0"

REM ============================================================================
REM STEP 3: Setup Logging
REM ============================================================================

set LOG_FILE=%~dp0install.log
echo ============================================================ > "%LOG_FILE%"
echo Manufacturing Orchestrator - Bootstrapper Installation >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo Installation started: %date% %time% >> "%LOG_FILE%"
echo Working Directory: %CD% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo.
echo ============================================================
echo MANUFACTURING ORCHESTRATOR - BOOTSTRAPPER INSTALLER
echo ============================================================
echo.
echo Working Directory: %CD%
echo Installation log: %LOG_FILE%
echo.

REM ============================================================================
REM STEP 4: Check for Node.js
REM ============================================================================

echo [STEP 1/6] Checking for Node.js...
echo [STEP 1/6] Checking for Node.js... >> "%LOG_FILE%"

where node >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version 2^>^&1') do set NODE_VERSION=%%i
    echo [OK] Node.js is already installed: !NODE_VERSION!
    echo [OK] Node.js found: !NODE_VERSION! >> "%LOG_FILE%"
    goto :skip_node_install
)

echo [INFO] Node.js not found - will download and install automatically
echo [INFO] Node.js not detected >> "%LOG_FILE%"

REM ============================================================================
REM STEP 5: Detect CPU Architecture
REM ============================================================================

echo.
echo [STEP 2/6] Detecting system architecture...
echo [STEP 2/6] Detecting architecture... >> "%LOG_FILE%"

set ARCH=x64
if "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ARCH=arm64

echo [OK] Architecture detected: %ARCH%
echo [OK] Architecture: %ARCH% >> "%LOG_FILE%"

REM ============================================================================
REM STEP 6: Download Node.js LTS
REM ============================================================================

echo.
echo [STEP 3/6] Downloading Node.js LTS...
echo [STEP 3/6] Downloading Node.js LTS... >> "%LOG_FILE%"
echo.
echo This may take 2-5 minutes depending on your internet connection...
echo.

REM Get latest LTS version from nodejs.org
set NODE_DOWNLOAD_URL=https://nodejs.org/dist/v22.11.0/node-v22.11.0-%ARCH%.msi
set NODE_INSTALLER=%TEMP%\nodejs-installer.msi

echo Downloading from: %NODE_DOWNLOAD_URL%
echo URL: %NODE_DOWNLOAD_URL% >> "%LOG_FILE%"
echo Saving to: %NODE_INSTALLER%
echo.

powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_DOWNLOAD_URL%' -OutFile '%NODE_INSTALLER%' -UseBasicParsing}" >> "%LOG_FILE%" 2>&1

if not exist "%NODE_INSTALLER%" (
    echo [ERROR] Failed to download Node.js installer!
    echo [ERROR] Download failed >> "%LOG_FILE%"
    echo.
    echo Please check your internet connection and try again.
    echo Or manually install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js installer downloaded successfully
echo [OK] Download complete: %NODE_INSTALLER% >> "%LOG_FILE%"

REM ============================================================================
REM STEP 7: Install Node.js Silently
REM ============================================================================

echo.
echo [STEP 4/6] Installing Node.js...
echo [STEP 4/6] Installing Node.js... >> "%LOG_FILE%"
echo.
echo This will take 1-2 minutes...
echo Please wait while Node.js is being installed...
echo.

msiexec /i "%NODE_INSTALLER%" /quiet /qn /norestart /log "%TEMP%\nodejs-install.log"

if %errorLevel% neq 0 (
    echo [ERROR] Node.js installation failed!
    echo [ERROR] msiexec failed with code %errorLevel% >> "%LOG_FILE%"
    echo.
    echo Check the log file at: %TEMP%\nodejs-install.log
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js installed successfully
echo [OK] Node.js installation complete >> "%LOG_FILE%"

REM Clean up installer
del /f /q "%NODE_INSTALLER%" >nul 2>&1

REM ============================================================================
REM STEP 8: Refresh PATH Environment Variable
REM ============================================================================

echo.
echo [INFO] Refreshing PATH environment variable...
echo [INFO] Refreshing PATH... >> "%LOG_FILE%"

REM Read the updated PATH from registry and apply to current session
for /f "usebackq tokens=2,*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul`) do set "SystemPath=%%B"
for /f "usebackq tokens=2,*" %%A in (`reg query "HKCU\Environment" /v PATH 2^>nul`) do set "UserPath=%%B"

set "PATH=%SystemPath%;%UserPath%"

REM Verify Node.js is now accessible
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARN] Node.js not immediately found in PATH
    echo [WARN] Attempting alternate PATH resolution...
    
    REM Try adding common Node.js installation paths
    set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs"
    
    where node >nul 2>&1
    if %errorLevel% neq 0 (
        echo [ERROR] Cannot find Node.js after installation!
        echo [ERROR] Node.js not in PATH after install >> "%LOG_FILE%"
        echo.
        echo Please restart your computer and run this installer again.
        echo.
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('node --version 2^>^&1') do set NODE_VERSION=%%i
echo [OK] Node.js is now available: !NODE_VERSION!
echo [OK] Node.js verified: !NODE_VERSION! >> "%LOG_FILE%"

:skip_node_install

REM ============================================================================
REM STEP 9: Verify npm is available
REM ============================================================================

echo.
echo [INFO] Verifying npm...
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] npm is not available!
    echo [ERROR] npm not found >> "%LOG_FILE%"
    echo.
    echo This is unusual - Node.js should include npm.
    echo Please reinstall Node.js manually from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version 2^>^&1') do set NPM_VERSION=%%i
echo [OK] npm is available: v!NPM_VERSION!
echo [OK] npm version: v!NPM_VERSION! >> "%LOG_FILE%"

REM ============================================================================
REM STEP 10: Install Application Dependencies
REM ============================================================================

echo.
echo ============================================================
echo [STEP 5/6] Installing application dependencies...
echo ============================================================
echo [STEP 5/6] Installing dependencies... >> "%LOG_FILE%"
echo.
echo Installing: express, cors, mysql2, node-windows
echo This may take 1-2 minutes...
echo.

call npm install >> "%LOG_FILE%" 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install project dependencies!
    echo [ERROR] npm install failed with code %errorLevel% >> "%LOG_FILE%"
    echo.
    echo Check the log file for details: %LOG_FILE%
    echo.
    pause
    exit /b 1
)

echo [OK] Project dependencies installed
echo [OK] Dependencies installed >> "%LOG_FILE%"

echo.
echo Installing node-windows for service support...
echo.

call npm install node-windows >> "%LOG_FILE%" 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install node-windows!
    echo [ERROR] npm install node-windows failed with code %errorLevel% >> "%LOG_FILE%"
    echo.
    echo Check the log file for details: %LOG_FILE%
    echo.
    pause
    exit /b 1
)

echo [OK] node-windows installed
echo [OK] node-windows installed >> "%LOG_FILE%"

REM ============================================================================
REM STEP 11: Install Windows Service
REM ============================================================================

echo.
echo ============================================================
echo [STEP 6/6] Installing Windows Service...
echo ============================================================
echo [STEP 6/6] Installing service... >> "%LOG_FILE%"
echo.
echo This may take 1-2 minutes...
echo Please wait while the service is being registered...
echo.

node install-windows-service.js >> "%LOG_FILE%" 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install Windows Service!
    echo [ERROR] Service installation failed with code %errorLevel% >> "%LOG_FILE%"
    echo.
    echo Check the log file for details: %LOG_FILE%
    echo.
    echo Common issues:
    echo   - Antivirus may be blocking the installation
    echo   - Windows Defender may need to allow this app
    echo   - Service may already be installed (run uninstall-service.bat first)
    echo.
    pause
    exit /b 1
)

REM ============================================================================
REM STEP 12: Installation Complete
REM ============================================================================

echo.
echo ============================================================
echo INSTALLATION COMPLETE!
echo ============================================================
echo Installation completed: %date% %time% >> "%LOG_FILE%"
echo.
echo [SUCCESS] Manufacturing Orchestrator is now installed and running!
echo.
echo Next steps:
echo   1. Open your browser to:
echo      http://localhost:3000/manufacturing-orchestrator.html
echo.
echo   2. Configure your Fishbowl connection
echo   3. Start processing work orders
echo.
echo Service Information:
echo   - Service Name: ManufacturingOrchestrator
echo   - Status: Running
echo   - Startup Type: Automatic (starts with Windows)
echo.
echo Management:
echo   - View service: services.msc
echo   - Server logs: %~dp0server.log
echo   - Install log: %LOG_FILE%
echo.
echo To uninstall:
echo   - Run: uninstall-service.bat
echo.
echo ============================================================
echo.
pause
