# Installing with NSSM (Recommended for Proper Graceful Shutdown)

## Why NSSM?

**node-windows has a critical limitation**: It cannot forward SIGTERM/SIGINT signals to the Node.js process on Windows, making graceful shutdown impossible.

**nssm (Non-Sucking Service Manager)** properly forwards signals and allows true graceful shutdown.

## Installation Steps

### 1. Download NSSM

Visit: https://nssm.cc/download

Or download directly:
```batch
# For 64-bit Windows (most common)
https://nssm.cc/release/nssm-2.24.zip
```

### 2. Extract NSSM

1. Extract the ZIP file
2. Copy `nssm.exe` from the `win64` folder to a permanent location
   - Recommended: `C:\nssm\nssm.exe`
   - Or add to your PATH

### 3. Uninstall Existing node-windows Service

**Run as Administrator:**
```batch
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator
node uninstall-windows-service.js
```

Wait 10 seconds for complete uninstallation.

### 4. Install Service with NSSM

**Run as Administrator:**

```batch
cd c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator

# Install the service
C:\nssm\nssm.exe install ManufacturingOrchestrator

# This will open a GUI. Configure:
# Path: C:\Program Files\nodejs\node.exe
# Startup directory: c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator
# Arguments: server.js
```

**Or install via command line:**

```batch
set NSSM=C:\nssm\nssm.exe
set APP_DIR=c:\Users\kye.tonkin\Desktop\manufacturing_orchestrator
set NODE_PATH=C:\Program Files\nodejs\node.exe

%NSSM% install ManufacturingOrchestrator "%NODE_PATH%"
%NSSM% set ManufacturingOrchestrator AppDirectory "%APP_DIR%"
%NSSM% set ManufacturingOrchestrator AppParameters "server.js"
%NSSM% set ManufacturingOrchestrator DisplayName "Manufacturing Orchestrator"
%NSSM% set ManufacturingOrchestrator Description "Queue-based Manufacturing Orchestrator for Fishbowl"
%NSSM% set ManufacturingOrchestrator Start SERVICE_AUTO_START

# CRITICAL: Set app stop method and timeout
%NSSM% set ManufacturingOrchestrator AppStopMethodConsole 30000
%NSSM% set ManufacturingOrchestrator AppStopMethodWindow 2000
%NSSM% set ManufacturingOrchestrator AppStopMethodThreads 2000

# Logging
%NSSM% set ManufacturingOrchestrator AppStdout "%APP_DIR%\server.log"
%NSSM% set ManufacturingOrchestrator AppStderr "%APP_DIR%\server.log"

# Environment
%NSSM% set ManufacturingOrchestrator AppEnvironmentExtra NODE_ENV=production

# Start the service
%NSSM% start ManufacturingOrchestrator
```

### 5. Verify Installation

Check service status:
```batch
C:\nssm\nssm.exe status ManufacturingOrchestrator
```

Should show: `SERVICE_RUNNING`

### 6. Test Graceful Shutdown

Restart the service to test:
```batch
net stop ManufacturingOrchestrator
# Wait 5 seconds
net start ManufacturingOrchestrator
```

Check `server.log` for:
```
============================================================
GRACEFUL SHUTDOWN INITIATED - Signal: SIGTERM
============================================================
```

## NSSM Commands

```batch
# Start service
net start ManufacturingOrchestrator
# or
C:\nssm\nssm.exe start ManufacturingOrchestrator

# Stop service
net stop ManufacturingOrchestrator
# or
C:\nssm\nssm.exe stop ManufacturingOrchestrator

# Restart service
C:\nssm\nssm.exe restart ManufacturingOrchestrator

# Check status
C:\nssm\nssm.exe status ManufacturingOrchestrator

# Edit configuration (GUI)
C:\nssm\nssm.exe edit ManufacturingOrchestrator

# Remove service
C:\nssm\nssm.exe remove ManufacturingOrchestrator confirm
```

## Configuration Details

### Stop Method Timeouts

- **AppStopMethodConsole: 30000ms** - Sends Ctrl+C (SIGINT), waits 30 seconds
- **AppStopMethodWindow: 2000ms** - Sends WM_CLOSE, waits 2 seconds
- **AppStopMethodThreads: 2000ms** - Terminates threads, waits 2 seconds

If the process doesn't exit after all methods, nssm forcefully kills it.

### Why 30 Seconds?

Our graceful shutdown:
1. Sets `stopRequested` flag (instant)
2. Waits up to 30 seconds for current WO to complete
3. Checks pending jobs (1-2 seconds)
4. Logs out tokens if needed (1-2 seconds)
5. Exits

Total: ~30-35 seconds maximum

## Benefits Over node-windows

| Feature | node-windows | nssm |
|---------|-------------|------|
| **Signal Forwarding** | ❌ Broken | ✅ Works |
| **Graceful Shutdown** | ❌ No | ✅ Yes |
| **Stop Timeout Control** | ⚠️ Limited | ✅ Full control |
| **Service Restart** | ⚠️ May hang | ✅ Clean |
| **Logs** | ✅ Yes | ✅ Yes |
| **Auto-start** | ✅ Yes | ✅ Yes |

## Expected Behavior

### With nssm (Graceful)

```
1. Service stop requested
2. nssm sends Ctrl+C to Node.js
3. SIGINT handler executes ✅
4. stopRequested flag set
5. Current WO completes (5-20 seconds)
6. Job status set to 'stopped'
7. Pending jobs checked
8. Tokens preserved if pending ✅
9. Process exits cleanly
10. Total time: 5-30 seconds
```

### Old node-windows (Forced)

```
1. Service stop requested
2. node-windows tries SIGINT (fails)
3. Immediately kills process ❌
4. No graceful shutdown
5. Current WO interrupted
6. Total time: <1 second (but data loss)
```

## Troubleshooting

### Service won't start

Check paths in configuration:
```batch
C:\nssm\nssm.exe dump ManufacturingOrchestrator
```

Verify Node.js path:
```batch
where node
```

### Shutdown still not graceful

1. Check `server.log` for "GRACEFUL SHUTDOWN INITIATED"
2. If missing, check nssm stop timeout:
   ```batch
   C:\nssm\nssm.exe get ManufacturingOrchestrator AppStopMethodConsole
   ```
   Should be 30000 or higher

3. Verify signal handler is installed (check startup logs for "Windows platform detected")

### Service keeps restarting

nssm will restart crashed services by default. Check logs for errors.

To disable auto-restart for testing:
```batch
C:\nssm\nssm.exe set ManufacturingOrchestrator AppExit Default Exit
```

## Migration Checklist

- [ ] Download and install nssm.exe
- [ ] Uninstall node-windows service
- [ ] Install nssm service with proper timeouts
- [ ] Test service start/stop
- [ ] Verify graceful shutdown in logs
- [ ] Test with running job
- [ ] Confirm session preservation works

## Reference

- nssm documentation: https://nssm.cc/usage
- nssm source: https://github.com/kirillkovalenko/nssm
