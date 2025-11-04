# Manufacturing Orchestrator v2.0

Queue-based Manufacturing Orchestrator for Fishbowl - Fault-tolerant work order processing with database queue.

## Features

- **Database-backed queue system** for persistent job state
- **Graceful shutdown** with job resumption capability
- **Batch processing** of manufacturing and disassembly orders
- **Serial number tracking** with automatic assignment
- **Partial job resumption** after interruptions
- **Secure credential storage** with encryption
- **Windows service integration** via NSSM

## Quick Start

### Prerequisites

- Node.js >= 14.0.0
- MySQL database
- Fishbowl server with API access
- Windows OS (for service installation)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd manufacturing_orchestrator_v1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy example configuration
   cp .env.example .env
   cp config.json.example config.json

   # Generate secure encryption key
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Edit .env and config.json with your settings
   ```

4. **Run as development server**
   ```bash
   npm start
   ```

5. **Install as Windows service** (recommended)
   ```bash
   install-service-nssm.bat
   ```

   See [INSTALL-WITH-NSSM.md](INSTALL-WITH-NSSM.md) for detailed instructions.

## Configuration

### Environment Variables (.env)

```bash
# Server
PORT=3000
LOG_LEVEL=INFO  # ERROR, WARN, INFO, or DEBUG

# Security
ENCRYPTION_KEY=your-64-char-hex-key
NODE_TLS_REJECT_UNAUTHORIZED=true  # false for dev with self-signed certs

# Fishbowl
FISHBOWL_SERVER_URL=https://your-server:28192
FISHBOWL_USERNAME=your-username
FISHBOWL_PASSWORD=your-password
FISHBOWL_DATABASE=your-database

# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=ceres_tracking_v2
```

### Configuration File (config.json)

Alternative to environment variables for Fishbowl credentials:

```json
{
  "serverUrl": "https://your-fishbowl-server:28192",
  "username": "your-username",
  "password": "your-password",
  "database": "your-database-name"
}
```

**Note**: Passwords in `config.json` are automatically encrypted.

## Architecture

### Backend Structure

```
src/
├── app.js                  # Express app setup
├── config/                 # Configuration management
│   ├── index.js
│   ├── server.js
│   └── database.js
├── db/                     # Database layer
│   ├── connection.js       # MySQL connection pool
│   ├── queries.js          # mo_queue operations
│   ├── helpers.js          # Reusable DB utilities
│   └── tokenStore.js       # Session token management
├── middleware/             # Express middleware
├── routes/                 # API endpoints
│   ├── auth.js             # Login/logout
│   ├── queue.js            # Queue management
│   ├── fishbowl.js         # Fishbowl proxy
│   ├── config.js           # Config save/load
│   └── mysql.js            # Database initialization
├── services/               # Business logic
│   ├── authService.js      # Authentication
│   ├── fishbowlApi.js      # Fishbowl API wrapper
│   ├── queueService.js     # Queue processing
│   ├── workOrderService.js # Work order execution
│   └── jobService.js       # Job state management
├── models/                 # Data models
│   └── jobStatus.js
└── utils/                  # Utilities
    ├── encryption.js       # AES-256-CBC encryption
    ├── logger.js           # Logging with rotation
    └── helpers.js
```

### Frontend Structure

```
public/
├── index.html              # Main application
├── css/
│   └── styles.css
└── js/
    ├── main.js             # Entry point
    ├── config.js           # Configuration
    ├── api/                # API client modules
    ├── services/           # Business logic
    ├── ui/                 # UI management
    └── utils/              # Utilities
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login to Fishbowl
- `POST /api/auth/logout` - Logout and cleanup
- `POST /api/auth/cleanup-orphaned` - Cleanup stale sessions

### Queue Management
- `GET /api/queue/status` - Get current job status
- `POST /api/queue/stop` - Stop processing
- `DELETE /api/queue/pending` - Clear pending items
- `GET /api/queue/has-pending` - Check for pending jobs

### Configuration
- `POST /api/config/save` - Save configuration
- `GET /api/config/load` - Load configuration

### Database
- `POST /api/mysql/initialize` - Initialize database

### Fishbowl Proxy
- `POST /api/fishbowl/data-query` - Execute SQL queries
- `POST /api/fishbowl/workorder-structure` - Get WO structure

## Database Schema

### mo_queue Table

```sql
CREATE TABLE mo_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  mo_number VARCHAR(50),
  barcode VARCHAR(100),
  serial_numbers TEXT,
  fg_location VARCHAR(100),
  raw_goods_part_id INT,
  fg_part_id INT,
  bom_num VARCHAR(50),
  bom_id INT,
  location_group_id INT,
  operation_type VARCHAR(20) DEFAULT 'build',
  status VARCHAR(20) DEFAULT 'Pending',
  wo_number VARCHAR(50),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  original_wo_structure LONGTEXT,
  INDEX idx_status (status),
  INDEX idx_mo_number (mo_number),
  INDEX idx_barcode (barcode),
  INDEX idx_bom_num (bom_num),
  INDEX idx_wo_number (wo_number)
);
```

## Workflows

### Build Operation

1. User authenticates with Fishbowl
2. Selects location group and BOM
3. Uploads CSV with serial numbers and barcodes
4. Items queued in database with status='Pending'
5. Background processor:
   - Groups items into batches (100 per MO)
   - Creates Manufacturing Orders
   - Issues MOs (creates Work Orders)
   - Processes each WO:
     - Opens pick
     - Applies tracking (serial numbers, barcodes)
     - Completes work order
   - Updates queue status (Success/Failed)
6. Job can be paused/resumed with state preserved

### Disassembly Operation

1. User selects finished goods for disassembly
2. System retrieves original WO structure
3. Creates reverse MO (finished goods → raw materials)
4. Issues and processes work orders
5. Returns components to specified location

## Security

### Credential Encryption

- Passwords encrypted with AES-256-CBC
- Encryption key configurable via environment variable
- Backward compatible with legacy key

### TLS Configuration

- Configurable certificate validation
- Set `NODE_TLS_REJECT_UNAUTHORIZED=true` for production
- Set `NODE_TLS_REJECT_UNAUTHORIZED=false` for dev with self-signed certs

### Session Management

- Active tokens stored in encrypted file
- Automatic cleanup of orphaned sessions
- Token preservation during graceful shutdown

## Logging

### Log Levels

- `ERROR` - Critical errors only
- `WARN` - Warnings and errors
- `INFO` - General information (default)
- `DEBUG` - Detailed debugging information

### Log Rotation

- Maximum size: 10 MB
- Maximum age: 7 days
- Backup files: 3
- Automatic rotation on size/age limits

### Log Files

- `server.log` - Application logs
- `server.log.1` - Previous rotation
- `daemon/*.log` - Windows service logs (if using NSSM)

## Service Installation

### Recommended: NSSM Method

```bash
install-service-nssm.bat
```

**Advantages**:
- Proper signal forwarding
- Graceful shutdown support
- Job resumption capability
- Industry standard solution

See [INSTALL-WITH-NSSM.md](INSTALL-WITH-NSSM.md) for details.

### Legacy: node-windows Method

Legacy installation files are available in `legacy-installers/` directory.
See [legacy-installers/README.md](legacy-installers/README.md) for migration instructions.

## Development

### Running in Development

```bash
npm run dev
```

### Setting Log Level

```bash
# Windows
set LOG_LEVEL=DEBUG
npm start

# Linux/Mac
LOG_LEVEL=DEBUG npm start
```

### Testing Queue Processing

1. Start server: `npm start`
2. Open browser: `http://localhost:3000`
3. Login to Fishbowl
4. Select location group and BOM
5. Upload CSV with test data
6. Monitor queue processing in logs

## Troubleshooting

### Connection Issues

1. **Fishbowl connection refused**
   - Check server URL in configuration
   - Verify Fishbowl API is enabled
   - Check firewall settings

2. **TLS certificate errors**
   - Set `NODE_TLS_REJECT_UNAUTHORIZED=false` for self-signed certs
   - Install proper certificate in production

### Database Issues

1. **Connection errors**
   - Verify MySQL is running
   - Check credentials in config
   - Ensure database exists

2. **Table creation fails**
   - Check MySQL user permissions
   - Verify database name
   - Check MySQL version compatibility

### Service Issues

1. **Service won't start**
   - Check service logs in `daemon/` directory
   - Verify Node.js installation
   - Check port 3000 availability

2. **Graceful shutdown not working**
   - Ensure using NSSM method (not node-windows)
   - Check NSSM configuration
   - Review GRACEFUL-SHUTDOWN-NOTES.md

## Performance

### Optimizations

- Database connection pooling
- Batch processing (100 items per MO)
- Parameterized SQL queries
- Indexed database columns
- HTTP module preloading
- Log file rotation

### Batch Sizes

Default batch size: 100 items per Manufacturing Order

Adjust in `src/services/queueService.js` if needed:
```javascript
const BATCH_SIZE = 100; // Modify this value
```

## Recent Updates

See [OPTIMIZATION-CHANGELOG.md](OPTIMIZATION-CHANGELOG.md) for detailed list of recent optimizations:

- ✅ Security improvements (environment-based configuration)
- ✅ SQL injection prevention (parameterized queries)
- ✅ Code deduplication (60+ lines removed)
- ✅ Performance optimizations (database indexes, batching)
- ✅ Dependency cleanup (node-windows → devDependencies)
- ✅ Project organization (legacy installers archived)

## Documentation

- [INSTALL-WITH-NSSM.md](INSTALL-WITH-NSSM.md) - Detailed NSSM installation
- [QUICK-START-NSSM.md](QUICK-START-NSSM.md) - Quick installation guide
- [GRACEFUL-SHUTDOWN-NOTES.md](GRACEFUL-SHUTDOWN-NOTES.md) - Shutdown mechanism
- [OPTIMIZATION-CHANGELOG.md](OPTIMIZATION-CHANGELOG.md) - Recent improvements
- [public/README.md](public/README.md) - Frontend architecture
- [legacy-installers/README.md](legacy-installers/README.md) - Legacy methods

## License

MIT

## Support

For issues or questions, please refer to the documentation or check the logs for detailed error messages.
