# Session Preservation for Service Restarts

## Problem
Windows service was losing session tokens and job state during service restarts. This caused:
- Need to re-login after every service restart
- Loss of BOM/location group information
- Unable to resume interrupted jobs

## Root Cause Analysis

### Signal Handling on Windows
From `daemon/manufacturingorchestrator.wrapper.log`:
```
Send SIGINT 38284
SIGINT to 38284 failed - Killing as fallback
```

**Finding**: node-windows wrapper cannot forward SIGINT to the Node.js process on Windows.
**Impact**: Graceful shutdown handlers never execute - process is forcefully terminated.
**Reality**: This is a known limitation of node-windows and cannot be fixed without replacing the service wrapper.

## Solution Implemented

Since we cannot fix the Windows signal handling, we've implemented **session preservation** to make the system resilient to forced shutdowns.

### 1. Session Preservation on Startup (`server.js` lines 160-207)
**On server startup**, before cleaning up orphaned tokens:
1. Check `config.json` for database name
2. Query `mo_queue` for pending items
3. **IF pending jobs exist** → Skip token cleanup (preserve sessions)
4. **ELSE** → Clean up orphaned tokens

### 2. Job Information Persistence (`src/routes/queue.js` lines 114-158)
**New API endpoint**: `/api/get-pending-job-info`
- Retrieves BOM number, BOM ID, and location group from pending jobs
- Allows job resumption without user having to re-enter configuration

### 3. Frontend Resume Logic (`public/js/services/queueService.js` lines 57-78)
**When resuming a job**:
- Calls `/api/get-pending-job-info` instead of querying Fishbowl directly
- Gets BOM/location from local database (not Fishbowl)
- Starts processing with correct parameters

### 4. Graceful Shutdown Handler (for non-Windows scenarios)
Added signal handlers for SIGTERM, SIGINT, SIGHUP, SIGBREAK:
- Sets `stopRequested` flag on running job
- Checks for pending jobs before token cleanup
- Preserves sessions when pending jobs exist

**Note**: These handlers work for Ctrl+C in development, but **do not** work when Windows service is stopped due to node-windows limitations.

## How to Apply Changes

### Option 1: Reinstall Service (Recommended)
Run as Administrator:
```batch
reinstall-service.bat
```

### Option 2: Manual Reinstall
Run as Administrator:
```batch
node uninstall-windows-service.js
timeout /t 5
node install-windows-service.js
```

## Verification

After reinstalling, check `daemon/manufacturingorchestrator.wrapper.log`:
- Should see `stoptimeout: 120` in startup parameters
- On service stop, should wait up to 120 seconds instead of immediate kill

Check `server.log`:
- Should see "GRACEFUL SHUTDOWN INITIATED - Signal: SIGBREAK"
- Should see "SHUTDOWN - Found X pending job(s) - PRESERVING session tokens"

## Expected Behavior

### Scenario 1: Service Restart During Job Processing
```
1. Job is running (50/100 items complete)
2. Service restart initiated
3. Process forcefully killed (node-windows limitation)
4. Current WO may be interrupted ⚠️
5. 50 items remain with status='Pending' in database ✓
6. Service restarts
7. Startup checks: 50 pending items found
8. Session tokens preserved (not logged out) ✓
9. User clicks "Resume Job"
10. BOM/location retrieved from database ✓
11. Job continues from item 51 ✓
```

### Scenario 2: Service Restart with No Jobs
```
1. No jobs running or pending
2. Service restart initiated
3. Process killed
4. Service restarts
5. Startup checks: 0 pending items
6. Orphaned tokens cleaned up ✓
7. Fresh start ✓
```

### Scenario 3: Development Mode (Ctrl+C)
```
1. Job is running
2. Press Ctrl+C
3. SIGINT handler executes ✓
4. stopRequested flag set
5. Current WO completes
6. Job status set to 'stopped'
7. Pending jobs checked
8. Tokens preserved if pending ✓
9. Clean exit ✓
```

## Troubleshooting

### If graceful shutdown still not working:
1. Check `daemon/manufacturingorchestrator.wrapper.log` for "SIGINT failed"
2. Check `server.log` for "GRACEFUL SHUTDOWN INITIATED"
3. Verify service has been reinstalled with new configuration

### If tokens still being lost:
1. Check `server.log` for "PRESERVING session tokens"
2. Verify `config.json` has correct database name
3. Check `mo_queue` table has pending items

## Configuration Files Modified
- `server.js` - Added graceful shutdown logic and Windows signal handlers
- `install-windows-service.js` - Added `stopparentfirst` and `stoptimeout`
- `reinstall-service.bat` - Created for easy service updates

## Timeout Configuration

| Phase | Timeout | Description |
|-------|---------|-------------|
| WO Completion | 60s | Wait for current work order to finish |
| Service Stop | 120s | node-windows waits before force kill |
| HTTP Server Close | 10s | Final timeout before forced exit |

Total maximum shutdown time: **130 seconds**

This ensures even complex work orders have time to complete properly.
