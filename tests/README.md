# Manufacturing Orchestrator - Test Suite

This directory contains unit and integration tests for the Manufacturing Orchestrator application.

## Test Structure

```
tests/
├── unit/                  # Unit tests for individual modules
│   └── utils/            # Tests for utility functions
│       ├── urlHelpers.test.js
│       ├── sqlHelpers.test.js
│       └── configValidator.test.js
└── integration/          # Integration tests for API endpoints
    └── health.test.js    # Health check endpoint tests
```

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Only Unit Tests
```bash
npm run test:unit
```

### Run Only Integration Tests
```bash
npm run test:integration
```

## Writing Tests

### Unit Tests
Unit tests should focus on testing individual functions or modules in isolation:

```javascript
const { normalizeUrl } = require('../../../src/utils/urlHelpers');

describe('normalizeUrl', () => {
  test('should remove trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });
});
```

### Integration Tests
Integration tests should test API endpoints and module interactions:

```javascript
const request = require('supertest');
const { app } = require('../../src/app');

describe('GET /api/health', () => {
  test('should return 200 with health info', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
  });
});
```

## Test Coverage Goals

- **Unit Tests:** Aim for 80%+ coverage on utility functions and business logic
- **Integration Tests:** Cover all API endpoints and critical workflows
- **Security Tests:** Ensure SQL injection prevention and input validation

## Mocking

When writing tests that depend on external services (Fishbowl API, MySQL), use mocks:

```javascript
jest.mock('../../src/services/fishbowlApi');

const { fishbowlQuery } = require('../../src/services/fishbowlApi');
fishbowlQuery.mockResolvedValue([{ id: 1, name: 'Test' }]);
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- All tests must pass before merging
- Coverage reports are generated automatically
- Integration tests may require environment setup

## Future Test Areas

Areas that need test coverage (contributions welcome):

1. **Services Tests**
   - queueService.js
   - workOrderService.js
   - authService.js

2. **Database Tests**
   - queries.js
   - helpers.js
   - sharedQueries.js

3. **Route Tests**
   - auth routes
   - queue routes
   - setup routes

4. **Middleware Tests**
   - validation middleware
   - error handler
   - setup enforcer

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
