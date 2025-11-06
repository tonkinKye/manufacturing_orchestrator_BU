@echo off
cd /d "%~dp0"

echo ============================================================
echo MANUFACTURING ORCHESTRATOR - COMPLETE INSTALLATION
echo ============================================================
echo.
echo This script will:
echo   1. Check/Install Node.js automatically
echo   2. Install npm dependencies
echo   3. Install NSSM (service manager)
echo   4. Configure and start the Windows service
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

REM ============================================================
REM STEP 1: CHECK AND INSTALL NODE.JS
REM ============================================================

echo ============================================================
echo STEP 1: CHECKING NODE.JS INSTALLATION
echo ============================================================
echo.

REM Check if Node.js is already installed
where node >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo [OK] Node.js is already installed: %NODE_VERSION%
    echo.
    goto :npm_install
)

echo [INFO] Node.js not found - will download and install automatically
echo.

REM Detect system architecture
set "ARCH=x64"
if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"
)
echo [INFO] Detected architecture: %ARCH%
echo.

REM Set Node.js download URL (LTS version)
set "NODE_VERSION=20.11.1"
if "%ARCH%"=="x64" (
    set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-x64.msi"
    set "NODE_INSTALLER=%TEMP%\node-v%NODE_VERSION%-x64.msi"
) else (
    set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-x86.msi"
    set "NODE_INSTALLER=%TEMP%\node-v%NODE_VERSION%-x86.msi"
)

echo Downloading Node.js v%NODE_VERSION% (%ARCH%)...
echo This may take 2-5 minutes depending on your connection...
echo.
echo URL: %NODE_URL%
echo.

REM Download Node.js installer
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_INSTALLER%' -UseBasicParsing}" 2>nul

if not exist "%NODE_INSTALLER%" (
    echo [ERROR] Failed to download Node.js installer!
    echo.
    echo Please download manually from: https://nodejs.org
    echo Then run this script again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js installer downloaded
echo.

echo Installing Node.js v%NODE_VERSION%...
echo This will take 1-2 minutes...
echo.

REM Install Node.js silently
msiexec /i "%NODE_INSTALLER%" /qn /norestart

REM Wait for installation to complete
timeout /t 10 /nobreak >nul

REM Clean up installer
del /f /q "%NODE_INSTALLER%" >nul 2>&1

echo [OK] Node.js installation complete
echo.

REM Refresh PATH environment variable
echo Refreshing PATH environment variable...
call :RefreshEnv

REM Verify Node.js installation
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [WARN] Node.js installed but not in PATH yet
    echo.
    echo Please close this window and run the script again, OR
    echo Add Node.js to PATH manually:
    echo   PATH: C:\Program Files\nodejs
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js is now available: %NODE_VERSION%
echo.

REM ============================================================
REM STEP 2: INSTALL NPM DEPENDENCIES
REM ============================================================

:npm_install
echo ============================================================
echo STEP 2: INSTALLING NPM DEPENDENCIES
echo ============================================================
echo.

REM Verify package.json exists
if not exist "%~dp0package.json" (
    echo [ERROR] package.json not found!
    echo.
    echo Make sure you're running this from the correct directory.
    echo Expected: %~dp0
    echo.
    pause
    exit /b 1
)

echo Installing npm packages (express, mysql2, cors)...
echo This may take 1-2 minutes...
echo.

REM Install npm dependencies
call npm install --production

if %errorLevel% neq 0 (
    echo [ERROR] npm install failed!
    echo.
    echo Trying again with verbose output...
    echo.
    call npm install --production --verbose

    if %errorLevel% neq 0 (
        echo.
        echo [ERROR] npm install failed again!
        echo.
        echo Please check:
        echo   1. Internet connection
        echo   2. Corporate proxy settings (if applicable)
        echo   3. Firewall/antivirus blocking npm
        echo.
        pause
        exit /b 1
    )
)

echo.
echo [OK] npm dependencies installed successfully
echo.

REM Verify node_modules exists
if not exist "%~dp0node_modules" (
    echo [WARN] node_modules folder not found after install
    echo.
    dir "%~dp0" | findstr /C:"package.json"
    echo.
    pause
)

REM ============================================================
REM STEP 3: INSTALL NSSM
REM ============================================================

echo ============================================================
echo STEP 3: INSTALLING NSSM (SERVICE MANAGER)
echo ============================================================
echo.

REM Set NSSM variables
set "NSSM_VERSION=2.24"
set "NSSM_URL=https://nssm.cc/release/nssm-%NSSM_VERSION%.zip"
set "NSSM_DIR=%~dp0nssm"
set "NSSM_ZIP=%TEMP%\nssm-%NSSM_VERSION%.zip"
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

REM Download and extract nssm
echo [INFO] nssm.exe not found - downloading automatically...
echo.
echo Downloading nssm %NSSM_VERSION% from nssm.cc...
echo This may take 1-2 minutes...
echo.

powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NSSM_URL%' -OutFile '%NSSM_ZIP%' -UseBasicParsing}" 2>nul

if not exist "%NSSM_ZIP%" (
    echo [ERROR] Failed to download nssm!
    echo.
    echo Please download manually from: https://nssm.cc/download
    echo Extract and place nssm.exe in: %NSSM_DIR%
    echo.
    pause
    exit /b 1
)

echo [OK] Downloaded nssm
echo.
echo Extracting nssm...

REM Create nssm directory
if not exist "%NSSM_DIR%" mkdir "%NSSM_DIR%"

REM Extract using PowerShell
powershell -Command "& {Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('%NSSM_ZIP%'); $entry = $zip.Entries | Where-Object {$_.FullName -like '*/win64/nssm.exe'}; if ($entry) {[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '%NSSM_EXE%', $true)}; $zip.Dispose()}" 2>nul

REM Clean up zip
del /f /q "%NSSM_ZIP%" >nul 2>&1

if not exist "%NSSM_EXE%" (
    echo [ERROR] Failed to extract nssm.exe!
    echo.
    echo Please download manually from: https://nssm.cc/download
    echo Extract win64\nssm.exe to: %NSSM_DIR%
    echo.
    pause
    exit /b 1
)

echo [OK] nssm.exe extracted to: %NSSM_EXE%
echo.

:nssm_ready
echo [OK] Using nssm: %NSSM_EXE%
echo.

REM ============================================================
REM STEP 4: CONFIGURE AND INSTALL SERVICE
REM ============================================================

echo ============================================================
echo STEP 4: INSTALLING WINDOWS SERVICE
echo ============================================================
echo.

REM Get paths
set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"

REM Find Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js not found in PATH!
    echo Please restart this script or add Node.js to PATH manually.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('where node') do set NODE_PATH=%%i
echo [OK] Found Node.js: %NODE_PATH%
echo.

echo Service configuration:
echo   Service Name: ManufacturingOrchestrator
echo   Display Name: Manufacturing Orchestrator
echo   Node.js: %NODE_PATH%
echo   App Directory: %APP_DIR%
echo   Script: server.js
echo   Stop Timeout: 30 seconds
echo.
echo Ready to install service?
pause

echo.
echo [1/8] Installing service...
"%NSSM_EXE%" install ManufacturingOrchestrator "%NODE_PATH%"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install service
    echo.
    echo Service may already exist. To reinstall:
    echo   1. Run: uninstall-service-nssm.bat
    echo   2. Run this script again
    echo.
    pause
    exit /b 1
)

echo [2/8] Setting application directory...
"%NSSM_EXE%" set ManufacturingOrchestrator AppDirectory "%APP_DIR%"

echo [3/8] Setting application parameters...
"%NSSM_EXE%" set ManufacturingOrchestrator AppParameters "server.js"

echo [4/8] Setting display name and description...
"%NSSM_EXE%" set ManufacturingOrchestrator DisplayName "Manufacturing Orchestrator"
"%NSSM_EXE%" set ManufacturingOrchestrator Description "Queue-based Manufacturing Orchestrator for Fishbowl - Proxy Server"

echo [5/8] Setting auto-start...
"%NSSM_EXE%" set ManufacturingOrchestrator Start SERVICE_AUTO_START

echo [6/8] Configuring graceful shutdown (30 second timeout)...
"%NSSM_EXE%" set ManufacturingOrchestrator AppStopMethodConsole 30000
"%NSSM_EXE%" set ManufacturingOrchestrator AppStopMethodWindow 2000
"%NSSM_EXE%" set ManufacturingOrchestrator AppStopMethodThreads 2000

echo [7/8] Configuring logging...
"%NSSM_EXE%" set ManufacturingOrchestrator AppStdout "%APP_DIR%\server.log"
"%NSSM_EXE%" set ManufacturingOrchestrator AppStderr "%APP_DIR%\server.log"

echo [8/8] Setting environment...
"%NSSM_EXE%" set ManufacturingOrchestrator AppEnvironmentExtra NODE_ENV=production

echo.
echo ============================================================
echo SERVICE INSTALLED SUCCESSFULLY
echo ============================================================
echo.
echo Service Name: ManufacturingOrchestrator
echo Status: Installed (not started)
echo.
echo Starting service now...
"%NSSM_EXE%" start ManufacturingOrchestrator

if %errorLevel% equ 0 (
    echo.
    echo [OK] Service started successfully!
    echo.
    echo Waiting 5 seconds for server to start...
    timeout /t 5 /nobreak >nul

    REM Check if service is running
    sc query ManufacturingOrchestrator | findstr /C:"RUNNING" >nul
    if %errorLevel% equ 0 (
        echo [OK] Service is running!
        echo.
        echo Web interface available at:
        echo   http://localhost:3000/index.html
        echo.
    ) else (
        echo [WARN] Service may not have started properly
        echo.
        echo Check service status:
        sc query ManufacturingOrchestrator
        echo.
        echo Check logs:
        echo   %APP_DIR%\server.log
        echo.
    )
) else (
    echo.
    echo [WARN] Service may not have started. Check logs.
    echo.
    echo To check status:
    echo   sc query ManufacturingOrchestrator
    echo.
    echo To view logs:
    echo   type "%APP_DIR%\server.log"
    echo.
)

echo ============================================================
echo INSTALLATION COMPLETE
echo ============================================================
echo.
echo Next steps:
echo   1. Open http://localhost:3000/index.html
echo   2. Configure Fishbowl credentials in Settings
echo   3. Start using the application!
echo.
echo Service management:
echo   Start:   net start ManufacturingOrchestrator
echo   Stop:    net stop ManufacturingOrchestrator
echo   Status:  sc query ManufacturingOrchestrator
echo.
echo Logs: %APP_DIR%\server.log
echo.
pause
goto :eof

REM ============================================================
REM HELPER FUNCTIONS
REM ============================================================

:RefreshEnv
REM Refresh environment variables without restarting
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "SysPath=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "UserPath=%%b"
set "PATH=%SysPath%;%UserPath%"
goto :eof