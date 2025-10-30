/**
 * Step navigation and UI state management
 */

import { log } from '../utils/helpers.js';
import { resetState, clearPollInterval } from '../utils/state.js';

/**
 * Enable a specific step
 */
export function enableStep(stepNum) {
  const step = document.getElementById(`step${stepNum}`);
  if (!step) return;

  step.classList.remove('disabled');
  step.style.opacity = '1';
  step.style.pointerEvents = 'auto';
  $(`#collapseStep${stepNum}`).collapse('show');

  // Hide previous step based on current step
  // Map: 1_5 -> hide 1, 2 -> hide 1_5, 2b -> hide 1_5, 3 -> hide 2, 4 -> hide 3
  const previousSteps = {
    '1_5': '1',
    '2': '1_5',
    '2b': '1_5',
    '3': '2',
    '4': '3'
  };

  if (previousSteps[stepNum]) {
    $(`#collapseStep${previousSteps[stepNum]}`).collapse('hide');
  } else if (typeof stepNum === 'number' && stepNum > 1) {
    $(`#collapseStep${stepNum - 1}`).collapse('hide');
  }
}

/**
 * Disable a specific step
 */
export function disableStep(stepNum) {
  const step = document.getElementById(`step${stepNum}`);
  if (!step) return;

  step.classList.add('disabled');
  step.style.opacity = '0.5';
  step.style.pointerEvents = 'none';
  $(`#collapseStep${stepNum}`).collapse('hide');
}

/**
 * Reset page to initial state
 */
export function resetPage(preserveResults = false) {
  log('[RESET] Resetting page to initial state' + (preserveResults ? ' (preserving results)' : '') + '...\n');

  // Reset state variables
  resetState();

  // Reset Step 1
  document.getElementById('locationGroupSelect').innerHTML = '<option value="">Loading location groups...</option>';
  document.getElementById('bomSelect').innerHTML = '<option value=""><img src="images/clipboard.svg" class="icon" alt="Clipboard"> First select a location group</option>';
  document.getElementById('bomSelect').disabled = true;
  document.getElementById('btnSelectBOM').disabled = true;
  document.getElementById('bomInfo').style.display = 'none';

  // Reset Step 1.5 (operation type selection)
  document.getElementById('panelBuild').style.border = '1px solid #ddd';
  document.getElementById('panelDisassemble').style.border = '1px solid #ddd';

  // Reset Step 2
  document.getElementById('csvFile').value = '';
  document.getElementById('csvInfo').style.display = 'none';

  // Reset Step 2B (disassembly)
  document.getElementById('availableFGList').innerHTML = '';
  document.getElementById('selectedFGList').innerHTML = '';
  document.getElementById('fgReturnLocation').innerHTML = '<option value="">Select return location for raw goods</option>';
  document.getElementById('availableFGCount').textContent = '0';
  document.getElementById('selectedFGCount').textContent = '0';
  document.getElementById('btnConfirmDisassembly').disabled = true;

  // Reset Step 3
  document.getElementById('csvPreview').innerHTML = '';
  document.getElementById('serialColumn').innerHTML = '';
  document.getElementById('barcodeColumn').innerHTML = '';
  document.getElementById('fgLocation').innerHTML = '<option value="">Loading locations...</option>';
  document.getElementById('hasHeaders').checked = true;
  document.getElementById('validationResults').style.display = 'none';
  document.getElementById('btnSaveToQueue').style.display = 'none';

  // Reset Step 4 - but preserve results if requested
  document.getElementById('queueStatsContent').innerHTML = 'Loading...';
  if (!preserveResults) {
    document.getElementById('processResults').style.display = 'none';
    document.getElementById('processResultContent').innerHTML = '';
  }
  document.getElementById('btnProcess').disabled = false;
  document.getElementById('btnProcess').innerHTML = '<img src="images/factory.svg" class="icon" alt="Factory"> Process Queue';
  document.getElementById('btnProcess').classList.remove('btn-default');
  document.getElementById('btnProcess').classList.add('btn-warning');

  // Stop any active polling
  clearPollInterval();

  // Disable and collapse ALL steps (including step 1, 1_5, 2b)
  const steps = ['step1', 'step1_5', 'step2', 'step2b', 'step3', 'step4'];
  steps.forEach(stepId => {
    const step = document.getElementById(stepId);
    if (step) {
      step.classList.add('disabled');
      step.style.opacity = '0.5';
      step.style.pointerEvents = 'none';
    }
  });

  // Collapse all accordions
  $('#collapseStep1').collapse('hide');
  $('#collapseStep1_5').collapse('hide');
  $('#collapseStep2').collapse('hide');
  $('#collapseStep2b').collapse('hide');
  $('#collapseStep3').collapse('hide');
  $('#collapseStep4').collapse('hide');

  // Hide reconnection banner
  document.getElementById('reconnectBanner').style.display = 'none';

  // Re-enable config panel
  const configPanel = document.querySelector('.config-panel');
  if (configPanel) {
    configPanel.style.opacity = '1';
    configPanel.style.pointerEvents = 'auto';
  }

  log('[RESET] Page reset complete - please login to continue\n');
}
