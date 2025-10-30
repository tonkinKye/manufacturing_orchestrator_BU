/**
 * Configuration and constants for Manufacturing Orchestrator
 */

export const APP_CONFIG = {
  appName: 'ManufacturingOrchestrator',
  appId: 20251022,
  sessionStorageKey: 'mo_session',
  sessionMaxAge: 24 * 60 * 60 * 1000 // 24 hours
};

export const DEFAULT_PLACEHOLDERS = {
  select: '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> Select',
  loadingLocationGroups: 'Loading location groups...',
  selectLocationGroup: '<img src="images/clipboard.svg" class="icon" alt="Clipboard"> First select a location group',
  loadingLocations: 'Loading locations...',
  loading: 'Loading...'
};

export const OPERATION_TYPES = {
  BUILD: 'build',
  DISASSEMBLE: 'disassemble'
};
