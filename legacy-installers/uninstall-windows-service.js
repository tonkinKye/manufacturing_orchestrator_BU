// ============================================================================
// Manufacturing Orchestrator - Windows Service Uninstaller
// ============================================================================

const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'ManufacturingOrchestrator',
  description: 'Queue-based Manufacturing Orchestrator for Fishbowl - Proxy Server',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', function() {
  console.log('\n' + '='.repeat(60));
  console.log('SERVICE UNINSTALLED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log('The ManufacturingOrchestrator service has been removed.');
  console.log('\nNote: Log files and configuration files have NOT been deleted.');
  console.log('To reinstall, run: node install-windows-service.js');
  console.log('\n');
});

svc.on('error', function(err) {
  console.error('Error uninstalling service:', err);
  process.exit(1);
});

svc.on('invalidinstallation', function() {
  console.log('\n' + '='.repeat(60));
  console.log('SERVICE NOT INSTALLED');
  console.log('='.repeat(60));
  console.log('The ManufacturingOrchestrator service is not currently installed.');
  console.log('Nothing to uninstall.');
  console.log('\n');
  process.exit(0);
});

console.log('\n' + '='.repeat(60));
console.log('UNINSTALLING MANUFACTURING ORCHESTRATOR WINDOWS SERVICE');
console.log('='.repeat(60));
console.log('Please wait...\n');

svc.uninstall();
