# Legacy Installation Methods

This directory contains older installation methods that are kept for reference only.

## Recommended Installation Method

**Use NSSM (Non-Sucking Service Manager)** for the best Windows service experience:

```batch
install-service-nssm.bat
```

See `INSTALL-WITH-NSSM.md` and `QUICK-START-NSSM.md` in the root directory for details.

## Files in This Directory

### node-windows Method (Legacy)
- `install-windows-service.js` - Uses node-windows npm package
- `uninstall-windows-service.js` - Uninstalls node-windows service
- `install-service.bat` - Batch wrapper with Node.js bootstrapping
- `uninstall-service.bat` - Batch wrapper for uninstall
- `reinstall-service.bat` - Convenience script for reinstallation

### Why NSSM is Recommended

1. **Better Signal Handling**: NSSM properly forwards Windows signals (SIGTERM, SIGINT) to Node.js
2. **Graceful Shutdown**: Allows the application to complete in-progress work orders before stopping
3. **Session Preservation**: Enables proper cleanup of Fishbowl auth tokens
4. **Simpler**: No need for node-windows package in dependencies

### Why These Are Archived

- **node-windows** has limitations with Windows signal handling
- Graceful shutdown doesn't work reliably with node-windows on Windows
- NSSM is the industry-standard solution for Node.js Windows services

## Migration

If you're currently using the node-windows method:

1. Uninstall the current service:
   ```batch
   cd legacy-installers
   uninstall-service.bat
   ```

2. Install using NSSM:
   ```batch
   cd ..
   install-service-nssm.bat
   ```
