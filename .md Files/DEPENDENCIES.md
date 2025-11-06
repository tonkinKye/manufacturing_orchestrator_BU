# Dependencies Documentation

## Required Dependencies

### Production Dependencies
These are installed by default with `npm install`:

- **`@primno/dpapi`** (^2.0.1) - Windows Data Protection API for secure credential encryption
- **`cors`** (^2.8.5) - Cross-Origin Resource Sharing middleware for Express
- **`express`** (^4.18.2) - Web application framework
- **`mysql2`** (^3.15.3) - MySQL client with connection pooling support

### Development Dependencies
These are only needed for development (installed with `npm install`):

- **`node-windows`** (^1.0.0-beta.8) - Windows service management
- **`jest`** (^29.7.0) - Testing framework
- **`supertest`** (^6.3.3) - HTTP assertion library for testing

---

## Optional Dependencies

### `p-limit` (^5.0.0) - Concurrent Processing

**Status:** Optional (not installed by default)

**Purpose:** Enables concurrent work order processing instead of sequential processing.

**Default Behavior:** The application processes work orders sequentially (one at a time), which is the safest approach for Fishbowl API stability.

**When to Install:**
- You want to process multiple work orders concurrently
- You've tested thoroughly with your Fishbowl instance
- You understand the risks of concurrent API calls

**Installation:**
```bash
npm install p-limit
```

**Configuration:**
After installing, set the concurrency limit in your `.env` file:
```bash
CONCURRENT_WO_LIMIT=3  # Process 3 work orders at once (start conservative)
```

**Implementation:**
The concurrent processing logic is already prepared in `src/services/queueService.js` around line 789. When `p-limit` is installed, you can uncomment the concurrent processing code.

**⚠️ Warning:**
- Start with low concurrency (2-3) and monitor Fishbowl performance
- Higher concurrency may cause:
  - Fishbowl API rate limiting or timeouts
  - Database locking issues
  - Unexpected API behavior
- Test thoroughly in development before using in production

**Performance Impact:**
- Sequential (default): 100% reliable, slower for large batches
- Concurrent (with p-limit): Faster processing, requires testing

**Recommendation:** Only enable concurrent processing after thorough testing shows stable results with your specific Fishbowl configuration.

---

## Installing Dependencies

### Production Installation
```bash
npm install --production
```
Installs only required dependencies (excludes jest, supertest, node-windows).

### Full Installation (Development)
```bash
npm install
```
Installs all dependencies including development tools.

### Install Optional Dependencies
```bash
npm install  # Installs required + dev dependencies
npm install p-limit  # Add optional concurrent processing
```

---

## Version Compatibility

### Node.js
- **Minimum:** 14.0.0
- **Recommended:** 18.x or 20.x LTS
- **Tested with:** 22.20.0

### Platform Support
- **Primary:** Windows (required for DPAPI encryption)
- **Development:** Can run on Linux/macOS with `ENCRYPTION_KEY` environment variable set

---

## Troubleshooting

### Issue: npm install fails with "Invalid package name"
**Cause:** Comments in package.json (not supported)
**Solution:** Ensure package.json has no `_comment` fields

### Issue: DPAPI errors on non-Windows platforms
**Cause:** `@primno/dpapi` is Windows-only
**Solution:** Set `ENCRYPTION_KEY` environment variable for development on other platforms

### Issue: Tests failing
**Cause:** Jest or supertest not installed
**Solution:** Run `npm install` (not `npm install --production`)

---

## Future Dependencies

Potential additions for future features:

- **`p-map`** or **`p-queue`** - Alternative concurrency control libraries
- **`ioredis`** - Redis client for caching static data (locations, BOMs)
- **`ws`** - WebSocket library for real-time progress updates
- **`prom-client`** - Prometheus metrics for monitoring
- **`swagger-ui-express`** - API documentation UI
- **`helmet`** - Security headers middleware
- **`compression`** - Response compression
- **`rate-limiter-flexible`** - Advanced rate limiting

These are **not currently needed** but may be useful for future enhancements.
