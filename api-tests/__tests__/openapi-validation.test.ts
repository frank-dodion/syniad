/**
 * Tests to ensure API responses match the OpenAPI specification
 * This helps keep the spec and implementation in sync
 */

import path from 'path';
import { Buffer } from 'buffer';

// Load environment variables
function loadEnv() {
  const fs = require('fs');
  const envFile = path.join(__dirname, '../../.env.api-test');
  const envVars: Record<string, string> = {};
  
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8')
      .split('\n')
      .forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...values] = trimmed.split('=');
          if (key && values.length > 0) {
            envVars[key.trim()] = values.join('=').trim();
          }
        }
      });
  }
  
  return {
    API_URL: envVars.API_URL || '',
    ID_TOKEN: envVars.ID_TOKEN || ''
  };
}

// Require the validator class (CommonJS module)
const OpenAPIValidator = require('../../scripts/validate-api-response');
const validatorPath = path.join(__dirname, '../../docs/openapi.yaml');

describe('OpenAPI Specification Validation', () => {
  let validator: any;

  beforeAll(() => {
    validator = new OpenAPIValidator(validatorPath);
  });

  describe('GET /test endpoint', () => {
    test('response should match OpenAPI spec', async () => {
      const env = loadEnv();
      if (!env.API_URL || !env.ID_TOKEN) {
        console.log('Skipping OpenAPI validation test - missing credentials');
        return;
      }

      const response = await fetch(`${env.API_URL}/test`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.ID_TOKEN}`,
        },
      });

      const responseBody = await response.json();
      const validation = validator.validateResponse('GET', '/test', String(response.status), responseBody);

      if (!validation.valid) {
        console.error('Validation errors:', validation.errors || validation.message);
        console.error('Response:', JSON.stringify(responseBody, null, 2));
      }

      expect(validation.valid).toBe(true);
      if (validation.errors) {
        console.error('Validation errors:', validation.errors);
      }
    });
  });

  describe('GET /games endpoint', () => {
    test('response should match OpenAPI spec', async () => {
      const env = loadEnv();
      if (!env.API_URL || !env.ID_TOKEN) {
        console.log('Skipping OpenAPI validation test - missing credentials');
        return;
      }

      const response = await fetch(`${env.API_URL}/games`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.ID_TOKEN}`,
        },
      });

      const responseBody = await response.json();
      const validation = validator.validateResponse('GET', '/games', String(response.status), responseBody);

      expect(validation.valid).toBe(true);
      if (!validation.valid && validation.errors) {
        console.error('Validation errors:', validation.errors);
        console.error('Response:', JSON.stringify(responseBody, null, 2));
      }
    });
  });

  describe('POST /games endpoint', () => {
    test('response should match OpenAPI spec', async () => {
      const env = loadEnv();
      if (!env.API_URL || !env.ID_TOKEN) {
        console.log('Skipping OpenAPI validation test - missing credentials');
        return;
      }

      const response = await fetch(`${env.API_URL}/games`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.ID_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playerName: 'OpenAPI Test Player' }),
      });

      const responseBody = await response.json();
      const validation = validator.validateResponse('POST', '/games', String(response.status), responseBody);

      expect(validation.valid).toBe(true);
      if (!validation.valid && validation.errors) {
        console.error('Validation errors:', validation.errors);
        console.error('Response:', JSON.stringify(responseBody, null, 2));
      }
    });
  });

  describe('OpenAPI Spec Structure', () => {
    test('spec should be parseable and have required structure', () => {
      expect(validator.spec).toBeDefined();
      expect(validator.spec.openapi).toMatch(/^3\./);
      expect(validator.spec.info).toBeDefined();
      expect(validator.spec.paths).toBeDefined();
      expect(Object.keys(validator.spec.paths).length).toBeGreaterThan(0);
    });

    test('all endpoints should have operation IDs', () => {
      const endpoints = validator.getEndpoints();
      for (const { method, path } of endpoints) {
        const pathItem = validator.spec.paths[path];
        const operation = pathItem[method.toLowerCase()];
        expect(operation.operationId).toBeDefined();
      }
    });

    test('all endpoints should have response schemas', () => {
      const endpoints = validator.getEndpoints();
      for (const { method, path } of endpoints) {
        const pathItem = validator.spec.paths[path];
        const operation = pathItem[method.toLowerCase()];
        expect(operation.responses).toBeDefined();
        expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
      }
    });
  });
});

