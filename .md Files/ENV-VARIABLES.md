# Environment Variables Guide

This file documents all environment variables supported by the Manufacturing Orchestrator.

**Status:** ✅ **ALL ENVIRONMENT VARIABLES ARE NOW FULLY IMPLEMENTED**

## ✅ IMPLEMENTED - All Variables Work

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

### Fishbowl Configuration (Optional)
```bash
FISHBOWL_SERVER_URL=https://your-fishbowl-server:28192
FISHBOWL_USERNAME=your-username
FISHBOWL_PASSWORD=your-password
FISHBOWL_DATABASE=your-database-name
```
**Used by:** `src/config/fishbowl.js`
**Purpose:** Fishbowl API connection credentials
**Default:** Falls back to config.json if not set
**Required:** No (can use config.json or web UI instead)
**Priority:** Environment variables take precedence over config.json

### MySQL Database Configuration (Optional)
```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
```
**Used by:** `src/config/database.js`
**Purpose:** MySQL database connection credentials
**Default:** localhost:3306, root user, legacy encrypted password
**Required:** No (uses sensible defaults)

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

### ✅ Fishbowl Credentials (Multiple Options)

**Option 1 - Environment Variables (Recommended for Production):**
```bash
# In .env
FISHBOWL_SERVER_URL=https://your-server:28192
FISHBOWL_USERNAME=admin
FISHBOWL_PASSWORD=your-password
FISHBOWL_DATABASE=your_database
```

**Option 2 - config.json (Web UI):**
1. Open http://localhost:3000/index.html
2. Click Settings
3. Enter new credentials
4. Click Save (auto-encrypts and saves to config.json)

**Option 3 - config.json (Manual):**
```json
// config.json
{
  "serverUrl": "https://your-server:28192",
  "username": "admin",
  "password": "encrypted-password-here",
  "database": "your_database"
}
```

**Note:** Environment variables take precedence over config.json

### ✅ MySQL Credentials (Multiple Options)

**Option 1 - Environment Variables (Recommended):**
```bash
# In .env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
```

**Option 2 - Use Defaults:**
```bash
# Don't set environment variables
# Uses: localhost:3306, root user, legacy encrypted password
```

**Note:** No need to encrypt passwords when using environment variables - they're used as plain text

---

## Configuration Priority

The system uses the following priority order (highest to lowest):

1. **Environment Variables (.env file)** - HIGHEST PRIORITY
2. **config.json file** (for Fishbowl credentials only)
3. **Built-in Defaults** (for MySQL configuration)

This design ensures:
- ✅ Production deployments can use secure environment variables
- ✅ Development can use the convenient web UI (config.json)
- ✅ Backward compatibility with existing config.json workflows
- ✅ Sensible defaults for quick setup

---

## Quick Reference

| Setting | Primary Source | Fallback | Can Change? |
|---------|---------------|----------|-------------|
| Encryption Key | .env | Hardcoded legacy key | ✅ Yes (via .env) |
| Server Port | .env | Default: 3000 | ✅ Yes (via .env) |
| Log Level | .env | Default: INFO | ✅ Yes (via .env) |
| TLS Validation | .env | Default: '0' | ✅ Yes (via .env) |
| Fishbowl Server | .env | config.json | ✅ Yes (via .env, UI, or edit file) |
| Fishbowl User | .env | config.json | ✅ Yes (via .env, UI, or edit file) |
| Fishbowl Password | .env | config.json (encrypted) | ✅ Yes (via .env or UI) |
| Fishbowl Database | .env | config.json | ✅ Yes (via .env, UI, or edit file) |
| MySQL Host | .env | Default: localhost | ✅ Yes (via .env) |
| MySQL Port | .env | Default: 3306 | ✅ Yes (via .env) |
| MySQL User | .env | Default: root | ✅ Yes (via .env) |
| MySQL Password | .env | Legacy encrypted password | ✅ Yes (via .env) |

---

## Example .env Files

### Minimal Configuration (Development)
```bash
# Manufacturing Orchestrator Environment Configuration
# Uses defaults and config.json for credentials

# Security - Use your own key for production
ENCRYPTION_KEY=a3d5f9e8c2b1a7f4e6d8c9b2a5f8e7d6c4b3a9f2e5d7c8b6a4f9e8d7c6b5a4f3

# Server Configuration
PORT=3000
LOG_LEVEL=INFO

# TLS Configuration (for self-signed certs)
NODE_TLS_REJECT_UNAUTHORIZED=false
```

### Full Configuration (Production)
```bash
# Manufacturing Orchestrator Environment Configuration
# All settings via environment variables

# Security
ENCRYPTION_KEY=your-secure-64-char-hex-key-here
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Server Configuration
PORT=3000
LOG_LEVEL=INFO
# Options: ERROR, WARN, INFO, DEBUG

# TLS Configuration
NODE_TLS_REJECT_UNAUTHORIZED=true

# Fishbowl Configuration
FISHBOWL_SERVER_URL=https://your-fishbowl-server:28192
FISHBOWL_USERNAME=your-username
FISHBOWL_PASSWORD=your-password
FISHBOWL_DATABASE=your-database-name

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
```

---

## Summary

**Status:** ✅ **ALL ENVIRONMENT VARIABLES ARE NOW FULLY IMPLEMENTED**

- **Total Variables:** 12 environment variables
- **All Implemented:** 100% coverage
- **Backward Compatible:** Existing config.json workflows still work
- **Flexible:** Use environment variables, config.json, or defaults

The system intelligently chooses the right configuration source based on what's available, ensuring a smooth experience for both development and production deployments.
