/**
 * Scheduler Configuration
 */

const SCHEDULER_CHECK_INTERVAL_SECONDS = parseInt(process.env.SCHEDULER_CHECK_INTERVAL_SECONDS) || 60;
const SCHEDULE_GRANULARITY = process.env.SCHEDULE_GRANULARITY || 'hourly';

// Validate granularity setting
if (!['hourly', 'any-time'].includes(SCHEDULE_GRANULARITY)) {
  console.warn(`Invalid SCHEDULE_GRANULARITY: ${SCHEDULE_GRANULARITY}. Using 'hourly' as default.`);
}

module.exports = {
  SCHEDULER_CHECK_INTERVAL_SECONDS,
  SCHEDULER_CHECK_INTERVAL_MS: SCHEDULER_CHECK_INTERVAL_SECONDS * 1000,
  SCHEDULE_GRANULARITY
};
