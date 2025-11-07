/**
 * Job Status Model
 * Represents the current state of a manufacturing job
 */

class JobStatus {
  constructor() {
    this.status = 'idle';        // idle, running, stopped, completed, error
    this.stopRequested = false;
    this.startTime = null;
    this.endTime = null;
    this.totalItems = 0;
    this.processedItems = 0;
    this.successItems = 0;
    this.failedItems = 0;
    this.currentMO = null;
    this.currentWO = null;
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.error = null;
    this.results = [];
    this.triggeredBy = null;     // 'ui' or 'scheduler'
  }

  /**
   * Reset the job status to initial state
   */
  reset() {
    this.status = 'idle';
    this.stopRequested = false;
    this.startTime = null;
    this.endTime = null;
    this.totalItems = 0;
    this.processedItems = 0;
    this.successItems = 0;
    this.failedItems = 0;
    this.currentMO = null;
    this.currentWO = null;
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.error = null;
    this.results = [];
    this.triggeredBy = null;
  }

  /**
   * Get current job status as plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      status: this.status,
      stopRequested: this.stopRequested,
      startTime: this.startTime,
      endTime: this.endTime,
      totalItems: this.totalItems,
      processedItems: this.processedItems,
      successItems: this.successItems,
      failedItems: this.failedItems,
      currentMO: this.currentMO,
      currentWO: this.currentWO,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      error: this.error,
      results: this.results,
      triggeredBy: this.triggeredBy
    };
  }
}

module.exports = JobStatus;
