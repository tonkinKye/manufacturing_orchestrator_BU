# TROUBLESHOOTING: Service Stuck in PAUSED State

## Problem Diagnosis

Your service is stuck in PAUSED state because:
1. An old **node-windows** service is installed (evidence in `daemon/` directory)
2. The old service has signal handling issues
3. Possible conflict between old and new service installations

## Complete Fix - Step by Step

### Step 1: Check Current Service Status

Open **Command Prompt as Administrator** and run:

```batch
sc query ManufacturingOrchestrator
```

This will show you the current service state and which service manager is being used.

### Step 2: Remove ALL Existing Services

**Option A: If using node-windows (old method)**

```batch
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator_v1

# Navigate to legacy installers
cd legacy-installers

# Uninstall old service
node uninstall-windows-service.js

# Wait 10 seconds
timeout /t 10

# Verify removed
sc query ManufacturingOrchestrator
```

If it still shows as installed:
```batch
sc delete ManufacturingOrchestrator
```

**Option B: If using NSSM (new method)**

```batch
# Stop the service first
net stop ManufacturingOrchestrator

# Remove with NSSM (adjust path to your nssm.exe)
nssm remove ManufacturingOrchestrator confirm

# Or if nssm is in your project:
%cd%\nssm\nssm.exe remove ManufacturingOrchestrator confirm
```

### Step 3: Clean Up Daemon Directory

```batch
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator_v1

# Remove daemon directory completely
rmdir /s /q daemon

# This removes old node-windows files
```

### Step 4: Fresh Installation with NSSM

**Method 1: Using the install script (Recommended)**

```batch
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator_v1

# Run as Administrator
install-service-nssm.bat
```

**Method 2: Manual installation**

```batch
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator_v1

# Find your Node.js path
where node
# Output example: C:\Program Files\nodejs\node.exe

# Set variables (adjust paths as needed)
set NSSM_EXE=%cd%\nssm\nssm.exe
set APP_DIR=%cd%
set NODE_PATH=C:\Program Files\nodejs\node.exe

# Install service
"%NSSM_EXE%" install ManufacturingOrchestrator "%NODE_PATH%"

# Configure
"%NSSM_EXE%" set ManufacturingOrchestrator AppDirectory "%APP_DIR%"
"%NSSM_EXE%" set ManufacturingOrchestrator AppParameters "server.js"
"%NSSM_EXE%" set ManufacturingOrchestrator DisplayName "Manufacturing Orchestrator"
"%NSSM_EXE%" set ManufacturingOrchestrator Description "Queue-based Manufacturing Orchestrator for Fishbowl"
"%NSSM_EXE%" set ManufacturingOrchestrator Start SERVICE_AUTO_START

# IMPORTANT: Set graceful shutdown timeouts
"%NSSM_EXE%" set ManufacturingOrchestrator AppStopMethodConsole 30000
"%NSSM_EXE%" set ManufacturingOrchestrator AppStopMethodWindow 2000
"%NSSM_EXE%" set ManufacturingOrchestrator AppStopMethodThreads 2000

# Configure logging
"%NSSM_EXE%" set ManufacturingOrchestrator AppStdout "%APP_DIR%\server.log"
"%NSSM_EXE%" set ManufacturingOrchestrator AppStderr "%APP_DIR%\server.log"

# Set environment
"%NSSM_EXE%" set ManufacturingOrchestrator AppEnvironmentExtra NODE_ENV=production

# Start the service
"%NSSM_EXE%" start ManufacturingOrchestrator
```

### Step 5: Verify Installation

```batch
# Check service status (should show RUNNING)
sc query ManufacturingOrchestrator

# Or with NSSM
%cd%\nssm\nssm.exe status ManufacturingOrchestrator

# Check if it's listening on port 3000
netstat -ano | findstr :3000
```

Expected output:
```
SERVICE_NAME: ManufacturingOrchestrator
        TYPE               : 10  WIN32_OWN_PROCESS
        STATE              : 4  RUNNING
```

### Step 6: Test the Service

Open browser and navigate to:
```
http://localhost:3000/index.html
```

## Common Issues and Solutions

### Issue 1: Service shows PAUSED instead of RUNNING

**Cause**: The service started but immediately paused (likely config issue)

**Fix**:
```batch
# Resume the service
sc continue ManufacturingOrchestrator

# Or restart it
net stop ManufacturingOrchestrator
net start ManufacturingOrchestrator
```

**Check logs**:
```batch
type server.log
```

Look for errors at the end of the file.

### Issue 2: Service shows STOPPED or START_PENDING

**Cause**: Application is crashing on startup

**Fix**:
1. Check `server.log` for errors
2. Common causes:
   - Port 3000 already in use
   - Missing `config.json` file
   - MySQL connection error
   - Missing node_modules

```batch
# Check if port 3000 is in use
netstat -ano | findstr :3000

# If something is using it, kill it or change port in .env
# Kill process (replace PID):
taskkill /PID <process_id> /F

# Or set different port
echo PORT=3001 > .env
```

### Issue 3: "The service did not respond to the start or control request"

**Cause**: Application taking too long to start or wrong Node.js path

**Fix**:
```batch
# Verify Node.js path
where node

# Update NSSM with correct path
%cd%\nssm\nssm.exe set ManufacturingOrchestrator Application "C:\Program Files\nodejs\node.exe"

# Try starting manually first
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator_v1
node server.js

# If it works, then install service
# If it errors, fix the error first
```

### Issue 4: NSSM not found

**Fix**:
```batch
# Download NSSM manually
# Visit: https://nssm.cc/download
# Extract nssm-2.24.zip
# Copy win64\nssm.exe to your project folder

# Or let the install script download it
install-service-nssm.bat
```

## Verification Checklist

After installation, verify:

- [ ] Service status is RUNNING (not PAUSED, STOPPED, or START_PENDING)
- [ ] Port 3000 is listening: `netstat -ano | findstr :3000`
- [ ] Web interface loads: http://localhost:3000/index.html
- [ ] `server.log` shows no errors
- [ ] `daemon/` directory no longer exists (node-windows removed)

## Quick Status Check Commands

```batch
# Service status
sc query ManufacturingOrchestrator

# NSSM status
%cd%\nssm\nssm.exe status ManufacturingOrchestrator

# View configuration
%cd%\nssm\nssm.exe dump ManufacturingOrchestrator

# Check port
netstat -ano | findstr :3000

# View recent logs
powershell -Command "Get-Content server.log -Tail 50"
```

## If All Else Fails

**Nuclear option - complete clean reinstall**:

```batch
# 1. Stop and remove ALL services
net stop ManufacturingOrchestrator
sc delete ManufacturingOrchestrator
%cd%\nssm\nssm.exe remove ManufacturingOrchestrator confirm

# 2. Clean directories
rmdir /s /q daemon
rmdir /s /q nssm

# 3. Verify Node.js works
node --version
npm --version

# 4. Test application manually
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator_v1
node server.js

# Press Ctrl+C to stop when you see "Server running on port 3000"

# 5. Run install script
install-service-nssm.bat
```

## Need More Help?

If the service is still stuck in PAUSED, provide these details:

1. Output of: `sc query ManufacturingOrchestrator`
2. Output of: `%cd%\nssm\nssm.exe status ManufacturingOrchestrator`
3. Last 50 lines of `server.log`
4. Contents of Event Viewer → Windows Logs → Application (filter for ManufacturingOrchestrator)

## Get Event Viewer Logs

```batch
# Export application event log
wevtutil qe Application /q:"*[System[Provider[@Name='ManufacturingOrchestrator']]]" /f:text > service-events.txt

# View the file
type service-events.txt
```

---

**Remember**: Always run commands as **Administrator** when working with Windows services!
