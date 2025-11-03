#!/usr/bin/env node

/**
 * Validates that the OpenAPI spec is syntactically correct
 * and checks for common issues.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const OPENAPI_SPEC_PATH = path.join(__dirname, '..', 'docs', 'openapi.yaml');

function validateOpenAPI() {
  console.log('Validating OpenAPI specification...\n');

  // Read and parse the OpenAPI spec
  const specContent = fs.readFileSync(OPENAPI_SPEC_PATH, 'utf8');
  let spec;
  
  try {
    spec = yaml.parse(specContent);
  } catch (error) {
    console.error('❌ Failed to parse YAML:', error.message);
    process.exit(1);
  }

  // Basic validation
  const errors = [];

  // Check required OpenAPI fields
  if (!spec.openapi) {
    errors.push('Missing "openapi" field');
  } else if (!spec.openapi.startsWith('3.')) {
    errors.push(`Invalid OpenAPI version: ${spec.openapi} (expected 3.x)`);
  }

  if (!spec.info) {
    errors.push('Missing "info" field');
  } else {
    if (!spec.info.title) errors.push('Missing "info.title"');
    if (!spec.info.version) errors.push('Missing "info.version"');
  }

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    errors.push('No paths defined');
  }

  // Validate each path
  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      errors.push(`Invalid path definition for ${pathKey}`);
      continue;
    }

    // Check each HTTP method
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Check for operation ID
      if (!operation.operationId) {
        errors.push(`Missing operationId for ${method.toUpperCase()} ${pathKey}`);
      }

      // Check responses
      if (!operation.responses || Object.keys(operation.responses).length === 0) {
        errors.push(`No responses defined for ${method.toUpperCase()} ${pathKey}`);
      } else {
        // Should have at least one 2xx, 4xx, or 5xx response
        const statusCodes = Object.keys(operation.responses);
        const has2xx = statusCodes.some(code => code.startsWith('2'));
        const hasError = statusCodes.some(code => code.startsWith('4') || code.startsWith('5'));
        
        if (!has2xx && !hasError) {
          errors.push(`No standard responses (2xx/4xx/5xx) for ${method.toUpperCase()} ${pathKey}`);
        }
      }

      // Check parameters if path has variables
      if (pathKey.includes('{')) {
        const pathVars = pathKey.match(/\{([^}]+)\}/g) || [];
        const paramNames = (operation.parameters || [])
          .filter(p => p.in === 'path')
          .map(p => p.name);

        for (const pathVar of pathVars) {
          const varName = pathVar.slice(1, -1); // Remove { }
          if (!paramNames.includes(varName)) {
            errors.push(`Path parameter {${varName}} in ${pathKey} not defined in ${method.toUpperCase()} operation`);
          }
        }
      }

      // Check security if operation requires auth
      if (operation.security && operation.security.length > 0) {
        const securitySchemes = Object.keys(spec.components?.securitySchemes || {});
        for (const secReq of operation.security) {
          const secKeys = Object.keys(secReq);
          for (const secKey of secKeys) {
            if (!securitySchemes.includes(secKey)) {
              errors.push(`Security scheme "${secKey}" used in ${method.toUpperCase()} ${pathKey} not defined`);
            }
          }
        }
      }
    }
  }

  // Check components
  if (spec.components) {
    if (spec.components.schemas && Object.keys(spec.components.schemas).length === 0) {
      console.warn('⚠️  No schemas defined in components');
    }

    // Validate security schemes
    if (spec.components.securitySchemes) {
      for (const [name, scheme] of Object.entries(spec.components.securitySchemes)) {
        if (!scheme.type) {
          errors.push(`Security scheme "${name}" missing type`);
        }
      }
    }
  }

  // Report results
  if (errors.length > 0) {
    console.error('❌ Validation errors found:\n');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error(`\nTotal errors: ${errors.length}`);
    process.exit(1);
  }

  const pathCount = Object.keys(spec.paths).length;
  const operationCount = Object.values(spec.paths).reduce((sum, pathItem) => {
    return sum + Object.keys(pathItem).filter(key => 
      ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(key)
    ).length;
  }, 0);

  console.log('✅ OpenAPI specification is valid!');
  console.log(`   - Version: ${spec.openapi}`);
  console.log(`   - Title: ${spec.info.title}`);
  console.log(`   - API Version: ${spec.info.version}`);
  console.log(`   - Paths: ${pathCount}`);
  console.log(`   - Operations: ${operationCount}`);
  console.log(`   - Security schemes: ${Object.keys(spec.components?.securitySchemes || {}).length}`);
  console.log(`   - Schemas: ${Object.keys(spec.components?.schemas || {}).length}\n`);
}

try {
  validateOpenAPI();
} catch (error) {
  console.error('❌ Validation failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

