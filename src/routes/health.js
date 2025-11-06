const express = require('express');
const router = express.Router();
const { getPool } = require('../db/connection');
const { getFishbowlConfig } = require('../config/fishbowl');
const { getCurrentJob } = require('../services/jobService');
const constants = require('../config/constants');

/**
 * Health Check Routes
 */

function setupHealthRoutes(logger) {
  /**
   * Basic health check - lightweight, returns immediately
   * Use this for load balancer health checks
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'manufacturing-orchestrator',
      version: process.env.npm_package_version || '2.0.0'
    });
  });

  /**
   * Detailed health check - includes database and job status
   * Use this for monitoring dashboards
   */
  router.get('/health/detailed', async (req, res) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'manufacturing-orchestrator',
      version: process.env.npm_package_version || '2.0.0',
      checks: {
        database: { status: 'unknown' },
        config: { status: 'unknown' },
        job: { status: 'unknown' }
      }
    };

    // Check database connectivity
    try {
      const config = await getFishbowlConfig();
      if (config.database) {
        const pool = await getPool(config.database);
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();

        health.checks.database = {
          status: 'ok',
          database: config.database,
          host: config.mysql?.host || 'unknown'
        };
      } else {
        health.checks.database = {
          status: 'not_configured',
          message: 'Database not configured'
        };
      }
    } catch (error) {
      health.checks.database = {
        status: 'error',
        message: error.message
      };
      health.status = 'degraded';
    }

    // Check configuration status
    try {
      const config = await getFishbowlConfig();
      const hasServerUrl = !!config.fishbowl?.serverUrl;
      const hasDatabase = !!config.database;

      health.checks.config = {
        status: (hasServerUrl && hasDatabase) ? 'ok' : 'incomplete',
        configured: {
          fishbowl: hasServerUrl,
          database: hasDatabase
        }
      };

      if (!hasServerUrl || !hasDatabase) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.checks.config = {
        status: 'error',
        message: error.message
      };
      health.status = 'degraded';
    }

    // Check current job status
    try {
      const currentJob = getCurrentJob();
      health.checks.job = {
        status: 'ok',
        currentStatus: currentJob.status,
        stopRequested: currentJob.stopRequested,
        ...(currentJob.status === 'running' && {
          currentWO: currentJob.currentWO,
          currentMO: currentJob.currentMO,
          processed: currentJob.processed,
          total: currentJob.total
        })
      };
    } catch (error) {
      health.checks.job = {
        status: 'error',
        message: error.message
      };
    }

    // Add system info
    health.system = {
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(process.memoryUsage().external / 1024 / 1024) + ' MB'
      },
      cpu: process.cpuUsage()
    };

    // Add configuration info
    health.configuration = {
      sslVerify: constants.SSL_VERIFY,
      batchSize: constants.BATCH_SIZE,
      dbPoolSize: constants.DB_POOL_SIZE,
      concurrentWOLimit: constants.CONCURRENT_WO_LIMIT
    };

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  /**
   * Readiness check - indicates if service is ready to accept requests
   */
  router.get('/health/ready', async (req, res) => {
    try {
      const config = await getFishbowlConfig();
      const isConfigured = config.fishbowl?.serverUrl && config.database;

      if (isConfigured) {
        res.json({
          ready: true,
          message: 'Service is ready to accept requests'
        });
      } else {
        res.status(503).json({
          ready: false,
          message: 'Service is not yet configured'
        });
      }
    } catch (error) {
      res.status(503).json({
        ready: false,
        message: 'Service is not ready',
        error: error.message
      });
    }
  });

  /**
   * Liveness check - indicates if service is alive
   */
  router.get('/health/live', (req, res) => {
    res.json({
      alive: true,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

module.exports = setupHealthRoutes;
