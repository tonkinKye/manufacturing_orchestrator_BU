// ============================================================================
// Manufacturing Orchestrator - Windows Service Installer
// ============================================================================

const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'ManufacturingOrchestrator',
  description: 'Queue-based Manufacturing Orchestrator for Fishbowl - Proxy Server',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ],
  workingDirectory: __dirname,
  maxRestarts: 10,
  maxRetries: 5,
  abortOnError: false,
  wait: 2,
  grow: 0.5,
  stopparentfirst: true
});

svc.on('install', function() {
  console.log('\n' + '='.repeat(60));
  console.log('SERVICE INSTALLED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log('Service Name: ManufacturingOrchestrator');
  console.log('Status: Installed and Started');
  console.log('Startup Type: Automatic');
  console.log('Log File: ' + path.join(__dirname, 'server.log'));
  console.log('='.repeat(60));
  console.log('\nThe service is now running in the background.');
  console.log('Access the web interface at: http://localhost:3000/manufacturing-orchestrator.html');
  console.log('\nTo manage the service:');
  console.log('  - Open: services.msc');
  console.log('  - Find: "ManufacturingOrchestrator"');
  console.log('  - Right-click for options (Start, Stop, Restart)');
  console.log('\nTo uninstall:');
  console.log('  - Run: node uninstall-windows-service.js');
  console.log('\n');
  
  svc.start();
});

svc.on('start', function() {
  console.log('Service started successfully!');
});

svc.on('error', function(err) {
  console.error('Error installing service:', err);
  process.exit(1);
});

svc.on('alreadyinstalled', function() {
  console.log('\n' + '='.repeat(60));
  console.log('WARNING: Service Already Installed');
  console.log('='.repeat(60));
  console.log('The ManufacturingOrchestrator service is already installed.');
  console.log('\nTo reinstall:');
  console.log('  1. Run: node uninstall-windows-service.js');
  console.log('  2. Run: node install-windows-service.js');
  console.log('\n');
  process.exit(0);
});

console.log('\n' + '='.repeat(60));
console.log('INSTALLING MANUFACTURING ORCHESTRATOR AS WINDOWS SERVICE');
console.log('='.repeat(60));
console.log('Please wait...\n');

svc.install();
