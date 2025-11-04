@echo off
cd /d "%~dp0"

echo ============================================================
echo MANUFACTURING ORCHESTRATOR - INSTALL WITH NSSM
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
    echo ERROR: Failed to download nssm!
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
    echo ERROR: Failed to extract nssm.exe!
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

REM Get paths
set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"

REM Find Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js not found!
    echo Please install Node.js from: https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('where node') do set NODE_PATH=%%i
echo [OK] Found Node.js: %NODE_PATH%
echo.

echo Installing service with configuration:
echo   Service Name: ManufacturingOrchestrator
echo   Node.js: %NODE_PATH%
echo   App Directory: %APP_DIR%
echo   Script: server.js
echo   Stop Timeout: 30 seconds
echo.
pause

echo.
echo [1/8] Installing service...
"%NSSM_EXE%" install ManufacturingOrchestrator "%NODE_PATH%"
if %errorLevel% neq 0 (
    echo ERROR: Failed to install service
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
echo To start the service:
echo   net start ManufacturingOrchestrator
echo.
echo To check status:
echo   "%NSSM_EXE%" status ManufacturingOrchestrator
echo.
echo Web interface will be available at:
echo   http://localhost:3000/manufacturing-orchestrator.html
echo.
echo Logs: %APP_DIR%\server.log
echo nssm location: %NSSM_EXE%
echo.
echo Starting service now...
"%NSSM_EXE%" start ManufacturingOrchestrator

if %errorLevel% equ 0 (
    echo.
    echo [OK] Service started successfully!
) else (
    echo.
    echo [WARN] Service may not have started. Check logs.
)

echo.
echo ============================================================
pause
