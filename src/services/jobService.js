const JobStatus = require('../models/jobStatus');

/**
 * Job Service
 * Manages the current job status and state
 */

// Singleton job status instance
let currentJob = new JobStatus();

/**
 * Get current job status
 * @returns {Object} Current job status
 */
function getJobStatus() {
  return currentJob.toJSON();
}

/**
 * Reset job to initial state
 */
function resetJob() {
  currentJob.reset();
}

/**
 * Request job to stop
 * @returns {Object} Result
 */
function requestStop() {
  if (currentJob.status !== 'running') {
    throw new Error('No job is currently running');
  }

  currentJob.stopRequested = true;
  return {
    success: true,
    message: 'Stop requested - job will pause after current item completes'
  };
}

/**
 * Start a new job
 * @param {Object} params - Job parameters
 */
function startJob(params) {
  currentJob.reset();
  currentJob.status = 'running';
  currentJob.startTime = new Date().toISOString();
}

/**
 * Get reference to current job (for processors)
 * @returns {JobStatus} Current job instance
 */
function getCurrentJob() {
  return currentJob;
}

module.exports = {
  getJobStatus,
  resetJob,
  requestStop,
  startJob,
  getCurrentJob
};
