/**
 * Health Endpoint Integration Tests
 */

const request = require('supertest');
const express = require('express');
const setupHealthRoutes = require('../../src/routes/health');

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('Health Endpoints', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/api', setupHealthRoutes(mockLogger));
  });

  describe('GET /api/health', () => {
    test('should return 200 with basic health info', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('service', 'manufacturing-orchestrator');
      expect(response.body).toHaveProperty('version');
    });

    test('should return valid timestamp', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    test('should return positive uptime', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /api/health/live', () => {
    test('should return 200 with alive status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('alive', true);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/health/ready', () => {
    test('should return readiness status', async () => {
      const response = await request(app)
        .get('/api/health/ready');

      expect(response.body).toHaveProperty('ready');
      expect(response.body).toHaveProperty('message');

      // Either 200 (ready) or 503 (not ready) is acceptable
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('GET /api/health/detailed', () => {
    test('should return detailed health info', async () => {
      const response = await request(app)
        .get('/api/health/detailed');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('config');
      expect(response.body.checks).toHaveProperty('job');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('configuration');
    });

    test('should include system information', async () => {
      const response = await request(app)
        .get('/api/health/detailed');

      expect(response.body.system).toHaveProperty('platform');
      expect(response.body.system).toHaveProperty('nodeVersion');
      expect(response.body.system).toHaveProperty('memory');
      expect(response.body.system).toHaveProperty('cpu');
    });

    test('should include configuration information', async () => {
      const response = await request(app)
        .get('/api/health/detailed');

      expect(response.body.configuration).toHaveProperty('sslVerify');
      expect(response.body.configuration).toHaveProperty('batchSize');
      expect(response.body.configuration).toHaveProperty('dbPoolSize');
    });
  });
});
