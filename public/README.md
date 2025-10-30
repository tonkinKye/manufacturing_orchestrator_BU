# Manufacturing Orchestrator Frontend

This is the refactored modular frontend for the Manufacturing Orchestrator application.

## Structure

```
public/
├── index.html                          # Clean HTML shell (~390 lines)
├── manufacturing-orchestrator.html     # Legacy monolithic version (kept for reference)
├── css/
│   └── styles.css                     # Extracted CSS styles
├── js/
│   ├── main.js                        # Entry point & initialization
│   ├── config.js                      # Configuration & constants
│   ├── api/
│   │   ├── fishbowlApi.js            # Fishbowl API communication
│   │   └── queueApi.js               # Queue API communication
│   ├── services/
│   │   ├── authService.js            # Authentication & session management
│   │   ├── csvService.js             # CSV parsing & validation
│   │   ├── workOrderService.js       # Work order & BOM management
│   │   ├── disassemblyService.js     # Disassembly workflow
│   │   └── queueService.js           # Queue processing & job management
│   ├── ui/
│   │   └── stepManager.js            # Step navigation & UI state
│   └── utils/
│       ├── helpers.js                # Utility functions
│       └── state.js                  # Application state management
└── images/                            # SVG icons
```

## Key Improvements

### 1. **Modularity**
- Each file has a single, clear responsibility
- Easy to find and modify specific functionality
- Better code organization following the same pattern as the backend

### 2. **Maintainability**
- ~100-300 lines per file vs. 2,782 lines in monolithic version
- Clear separation of concerns
- Easier debugging with specific module files

### 3. **Modern Standards**
- ES6 modules with import/export
- Clean dependency management
- Type: module script loading

### 4. **Performance**
- Better browser caching (CSS/JS files cached separately)
- Smaller individual file downloads
- Modules loaded on demand

### 5. **Collaboration**
- Multiple developers can work on different modules
- Reduced merge conflicts
- Clear module boundaries

## Module Descriptions

### API Layer (`api/`)
- **fishbowlApi.js** - Direct communication with Fishbowl server (queries, API calls)
- **queueApi.js** - Queue database operations and job status

### Services Layer (`services/`)
- **authService.js** - Login, logout, session persistence, config management
- **csvService.js** - CSV file loading, parsing, validation, and queue saving
- **workOrderService.js** - Location groups, BOMs, operation type selection
- **disassemblyService.js** - Finished goods selection and disassembly workflow
- **queueService.js** - Queue processing, job control, status polling, job resumption

### UI Layer (`ui/`)
- **stepManager.js** - Step enabling/disabling, page reset, navigation control

### Utils Layer (`utils/`)
- **helpers.js** - Common utility functions (logging, DOM manipulation, etc.)
- **state.js** - Centralized application state management
- **config.js** - Application constants and configuration

## Usage

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Access the application:**
   ```
   http://localhost:3000/
   ```
   The server will automatically serve `index.html`

3. **Development:**
   - Edit individual module files in their respective directories
   - Browser will automatically reload on file changes (if using a dev server)
   - Use browser DevTools to debug specific modules

## Migration Notes

The original monolithic `manufacturing-orchestrator.html` (2,782 lines) has been refactored into:
- **1 HTML file** (390 lines) - Clean structure, no inline code
- **1 CSS file** (125 lines) - Extracted styles
- **12 JavaScript modules** - Organized by responsibility
- **Total:** ~2,800 lines across 14 files vs. 1 file

All functionality has been preserved - this is a structural refactor only.

## Browser Compatibility

- Modern browsers with ES6 module support
- Chrome 61+, Firefox 60+, Safari 11+, Edge 16+
- Uses `type="module"` for script loading
