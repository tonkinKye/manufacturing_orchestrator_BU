-- Migration: Add scheduled_for column to mo_queue table
-- Date: 2025-11-06
-- Description: Allows scheduling work orders to run at a specific date/time

-- Add the scheduled_for column (nullable - NULL means run immediately)
ALTER TABLE mo_queue
ADD COLUMN scheduled_for DATETIME NULL AFTER status;

-- Add index for efficient querying of ready items
CREATE INDEX idx_scheduled_for ON mo_queue(scheduled_for);

-- Update existing rows to NULL (run immediately) - already default but being explicit
UPDATE mo_queue SET scheduled_for = NULL WHERE scheduled_for IS NULL;

-- Verification query (optional - run manually to verify)
-- SELECT id, barcode, status, scheduled_for, created_at FROM mo_queue LIMIT 10;
