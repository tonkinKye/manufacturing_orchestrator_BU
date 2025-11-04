# Quick Start - Install with nssm (Automatic)

## One-Command Installation

This installation script **automatically downloads nssm** and installs the service with proper graceful shutdown support.

### Prerequisites

- Windows (Administrator access)
- Node.js installed
- Internet connection (for first-time nssm download)

### Installation Steps

1. **Open Command Prompt as Administrator**
   - Right-click `install-service-nssm.bat`
   - Select "Run as administrator"

2. **That's it!**
   - The script will:
     - ✓ Download nssm (if not already present)
     - ✓ Extract nssm to `./nssm/nssm.exe`
     - ✓ Install the Windows service
     - ✓ Configure 30-second graceful shutdown timeout
     - ✓ Start the service
     - ✓ Show you the web interface URL

3. **Access the Web Interface**
   ```
   http://localhost:3000/manufacturing-orchestrator.html
   ```

## What Gets Downloaded

- **nssm version 2.24** (~700KB)
- Downloaded from: https://nssm.cc/release/nssm-2.24.zip
- Extracted to: `./nssm/nssm.exe` (local to project)
- **No system-wide installation** - nssm stays in your project folder

## Management Commands

### Check Service Status
```batch
net start ManufacturingOrchestrator
```

Or from project directory:
```batch
nssm\nssm.exe status ManufacturingOrchestrator
```

### Restart Service
```batch
net stop ManufacturingOrchestrator
net start ManufacturingOrchestrator
```

### Uninstall Service
Run as Administrator:
```batch
uninstall-service-nssm.bat
```

## Why This Works Better Than node-windows

| Feature | node-windows | nssm (this script) |
|---------|-------------|-------------------|
| **Auto-download** | ❌ Manual npm install | ✅ Automatic |
| **Graceful shutdown** | ❌ Broken on Windows | ✅ Works perfectly |
| **Setup time** | ~5 minutes | ~30 seconds |
| **Service stays in "stopping"** | ⚠️ 2+ minutes | ✅ 5-30 seconds |
| **Session preservation** | ⚠️ Manual workarounds | ✅ Built-in support |

## What Happens Behind the Scenes

### First Run
```
1. Checks for nssm in PATH → Not found
2. Checks for nssm in ./nssm/ → Not found
3. Downloads nssm-2.24.zip from nssm.cc
4. Extracts win64/nssm.exe to ./nssm/
5. Installs service with configuration
6. Sets 30-second stop timeout
7. Starts service
```

### Subsequent Runs
```
1. Checks for nssm in ./nssm/ → Found!
2. Uses existing nssm.exe
3. Installs/updates service
4. Starts service
```

## Graceful Shutdown in Action

When you restart the service:

```
1. Windows sends stop signal
2. nssm forwards Ctrl+C to Node.js ✓
3. Node.js SIGINT handler runs
4. Sets stopRequested = true
5. Current work order completes (5-20 seconds)
6. Checks for pending jobs
7. Preserves session tokens if pending ✓
8. Exits cleanly
9. Service restarts
10. Sessions still valid ✓
```

**Total time: 5-30 seconds** (instead of 2+ minutes with node-windows)

## Troubleshooting

### "ERROR: Failed to download nssm!"

**Possible causes:**
- No internet connection
- Corporate firewall blocking nssm.cc

**Solutions:**
1. Download manually from https://nssm.cc/download
2. Extract `win64\nssm.exe` to `./nssm/nssm.exe` in your project
3. Run the install script again (it will use the local copy)

### "Service won't start"

Check the log:
```batch
type server.log
```

Common issues:
- Port 3000 already in use
- Node.js path incorrect
- Missing dependencies (run `npm install`)

### "Shutdown still takes too long"

Check if graceful shutdown is working:
1. Restart the service
2. Check `server.log` for:
   ```
   ============================================================
   GRACEFUL SHUTDOWN INITIATED - Signal: SIGINT
   ============================================================
   ```
3. If missing, the handler isn't running - check nssm configuration

## Files Created

```
your-project/
├── nssm/
│   └── nssm.exe              ← Downloaded automatically
├── install-service-nssm.bat  ← Installation script
├── uninstall-service-nssm.bat← Uninstall script
├── server.log                ← Service logs
└── .gitignore                ← Excludes nssm/ from git
```

## Uninstalling

Run as Administrator:
```batch
uninstall-service-nssm.bat
```

This will:
- Stop the service
- Remove the service
- **Keep** your configuration and logs
- **Keep** the nssm.exe file (for future use)

To completely remove everything:
```batch
uninstall-service-nssm.bat
rmdir /s /q nssm
```

## Next Steps

1. Install the service with `install-service-nssm.bat`
2. Open http://localhost:3000/manufacturing-orchestrator.html
3. Configure your Fishbowl connection
4. Start processing work orders
5. Test graceful shutdown by restarting the service
6. Verify sessions are preserved in the logs

**You're done!** The service now has proper graceful shutdown support.
