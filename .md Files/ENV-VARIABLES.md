# Environment Variables - What Actually Works

This file documents which environment variables are **actually implemented** in the code.

## ✅ IMPLEMENTED (These Actually Work)

### Security
```bash
ENCRYPTION_KEY=your-64-char-hex-key-here
```
**Used by:** `src/utils/encryption.js`
**Purpose:** Encryption key for passwords in config.json
**Default:** Hardcoded legacy key (with warning)
**Required:** No (falls back to legacy key)

### Server Configuration
```bash
PORT=3000
```
**Used by:** `src/config/server.js`
**Purpose:** HTTP server port
**Default:** 3000
**Required:** No

```bash
LOG_LEVEL=INFO
```
**Used by:** `src/config/server.js`
**Purpose:** Logging verbosity (ERROR, WARN, INFO, or DEBUG)
**Default:** INFO
**Required:** No

```bash
NODE_TLS_REJECT_UNAUTHORIZED=false
```
**Used by:** `src/config/server.js`
**Purpose:** TLS certificate validation (true/false)
**Default:** '0' (disabled, for dev with self-signed certs)
**Required:** No

---

## ❌ NOT IMPLEMENTED (In .env.example but Ignored)

These are listed in `.env.example` for **documentation purposes** and as **future enhancements**, but the code does NOT currently read them:

### Fishbowl Credentials (Uses config.json Instead)
```bash
# ❌ These are IGNORED - use config.json instead
FISHBOWL_SERVER_URL=...     # Use config.json: "serverUrl"
FISHBOWL_USERNAME=...       # Use config.json: "username"
FISHBOWL_PASSWORD=...       # Use config.json: "password" (encrypted)
FISHBOWL_DATABASE=...       # Use config.json: "database"
```

### MySQL Credentials (Hardcoded in src/config/database.js)
```bash
# ❌ These are IGNORED - hardcoded in code
DB_HOST=localhost           # Hardcoded: src/config/database.js line 4
DB_PORT=3306                # Hardcoded: src/config/database.js line 5
DB_USER=root                # Hardcoded: src/config/database.js line 6
DB_PASSWORD=...             # Hardcoded (encrypted): src/config/database.js line 7
DB_NAME=...                 # Uses config.json: "database"
```

---

## How to Configure Each Setting

### ✅ Encryption Key (Works)
**Option 1 - Environment Variable (Recommended):**
```bash
# Create .env file
echo ENCRYPTION_KEY=abc123... > .env

# Start server
npm start
```

**Option 2 - Use Legacy Key:**
```bash
# Don't create .env
# Server uses hardcoded key (shows warning)
npm start
```

### ✅ Server Port (Works)
**Option 1 - Environment Variable:**
```bash
# In .env
PORT=3001
```

**Option 2 - Command Line:**
```bash
set PORT=3001
npm start
```

**Option 3 - NSSM Service:**
```batch
nssm set ManufacturingOrchestrator AppEnvironmentExtra PORT=3001
```

### ✅ Log Level (Works)
**Option 1 - Environment Variable:**
```bash
# In .env
LOG_LEVEL=DEBUG
```

**Option 2 - Command Line:**
```bash
set LOG_LEVEL=DEBUG
npm start
```

### ❌ Fishbowl Credentials (Doesn't Work - Use config.json)
```json
// config.json
{
  "serverUrl": "https://your-server:28192",
  "username": "admin",
  "password": "encrypted-password-here",
  "database": "your_database"
}
```

**To change:**
1. Open http://localhost:3000/index.html
2. Click Settings
3. Enter new credentials
4. Click Save (auto-encrypts and saves to config.json)

### ❌ MySQL Credentials (Doesn't Work - Hardcoded)
**Current location:** `src/config/database.js`

**To change:**
1. Edit `src/config/database.js`
2. Modify lines 4-7:
```javascript
const MYSQL_CONFIG = {
  host: 'your-host',        // Change this
  port: 3306,                // Change this
  user: 'your-user',         // Change this
  passwordEncrypted: '...'   // Encrypt password first
};
```

**To encrypt MySQL password:**
```bash
node -e "const {encrypt} = require('./src/utils/encryption'); console.log(encrypt('your-mysql-password'));"
```

---

## Why Some Vars Aren't Implemented

### Design Decision: Minimize Breaking Changes

The optimization focused on:
- ✅ Security improvements (ENCRYPTION_KEY)
- ✅ Code quality (SQL injection, deduplication)
- ✅ Backward compatibility (nothing breaks)

**Not implemented to avoid:**
- ❌ Breaking existing config.json workflows
- ❌ Requiring users to migrate all settings
- ❌ Extensive testing of new config system

### Future Enhancement Opportunity

To fully implement environment-based config:

1. **Create new config loader** that checks env first, falls back to config.json
2. **Update all config readers** to use new loader
3. **Add migration guide** for users
4. **Test extensively** with all combinations
5. **Update documentation** and examples

**Estimated effort:** 4-6 hours of development + testing

---

## Quick Reference

| Setting | Source | Can Change? |
|---------|--------|-------------|
| Encryption Key | .env or hardcoded | ✅ Yes (via .env) |
| Server Port | .env or default 3000 | ✅ Yes (via .env) |
| Log Level | .env or default INFO | ✅ Yes (via .env) |
| TLS Validation | .env or default '0' | ✅ Yes (via .env) |
| Fishbowl Server | config.json | ✅ Yes (via UI or edit file) |
| Fishbowl User | config.json | ✅ Yes (via UI or edit file) |
| Fishbowl Password | config.json (encrypted) | ✅ Yes (via UI) |
| Fishbowl Database | config.json | ✅ Yes (via UI or edit file) |
| MySQL Host | Hardcoded | ⚠️ Edit code |
| MySQL Port | Hardcoded | ⚠️ Edit code |
| MySQL User | Hardcoded | ⚠️ Edit code |
| MySQL Password | Hardcoded (encrypted) | ⚠️ Edit code |

---

## Example .env (Realistic)

**This .env only includes what actually works:**

```bash
# Manufacturing Orchestrator Environment Configuration

# Security (ACTUALLY WORKS)
ENCRYPTION_KEY=a3d5f9e8c2b1a7f4e6d8c9b2a5f8e7d6c4b3a9f2e5d7c8b6a4f9e8d7c6b5a4f3
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Server Configuration (ACTUALLY WORKS)
PORT=3000
LOG_LEVEL=INFO
# Options: ERROR, WARN, INFO, DEBUG

# TLS Configuration (ACTUALLY WORKS)
NODE_TLS_REJECT_UNAUTHORIZED=false
# Set to true for production with valid certificates
# Set to false for development with self-signed certificates

# ────────────────────────────────────────────────────────
# The following settings are NOT implemented yet
# They are here for documentation only
# ────────────────────────────────────────────────────────

# Fishbowl Configuration (NOT IMPLEMENTED - use config.json)
# FISHBOWL_SERVER_URL=https://your-server:28192
# FISHBOWL_USERNAME=admin
# FISHBOWL_PASSWORD=your-password
# FISHBOWL_DATABASE=your-database

# MySQL Configuration (NOT IMPLEMENTED - hardcoded in code)
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=your-mysql-password
# DB_NAME=ceres_tracking_v2
```

---

## Summary

**Currently Implemented:** 4 environment variables
**Currently Ignored:** 9 environment variables in .env.example

The `.env.example` file was aspirational - showing best practices - but most variables aren't actually implemented in the code yet. This document clarifies what actually works vs what's planned for the future.
