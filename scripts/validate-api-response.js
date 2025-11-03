#!/usr/bin/env node

/**
 * Validates API responses against the OpenAPI specification
 * This can be used in tests to ensure responses match the spec
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class OpenAPIValidator {
  constructor(specPath) {
    const specContent = fs.readFileSync(specPath, 'utf8');
    this.spec = yaml.parse(specContent);
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this._compileSchemas();
  }

  _compileSchemas() {
    // Compile all schemas from components
    if (this.spec.components?.schemas) {
      for (const [name, schema] of Object.entries(this.spec.components.schemas)) {
        try {
          this.ajv.addSchema(schema, `#/components/schemas/${name}`);
        } catch (error) {
          console.warn(`Warning: Failed to compile schema ${name}:`, error.message);
        }
      }
    }
  }

  /**
   * Get the expected response schema for an endpoint
   */
  getResponseSchema(method, path, statusCode = '200') {
    const pathItem = this.spec.paths[path];
    if (!pathItem) {
      throw new Error(`Path ${path} not found in OpenAPI spec`);
    }

    const operation = pathItem[method.toLowerCase()];
    if (!operation) {
      throw new Error(`Method ${method} not found for path ${path}`);
    }

    const response = operation.responses[statusCode] || operation.responses.default;
    if (!response) {
      throw new Error(`Response ${statusCode} not defined for ${method} ${path}`);
    }

    const content = response.content?.['application/json'];
    if (!content) {
      return null; // No JSON schema (e.g., 204 No Content)
    }

    return content.schema;
  }

  /**
   * Validate a response against the OpenAPI spec
   */
  validateResponse(method, path, statusCode, responseBody) {
    try {
      const schema = this.getResponseSchema(method, path, statusCode);
      if (!schema) {
        return { valid: true, message: 'No schema defined for this response' };
      }

      // Resolve $ref references
      const resolvedSchema = this._resolveSchema(schema);
      
      const validate = this.ajv.compile(resolvedSchema);
      const valid = validate(responseBody);

      if (!valid) {
        return {
          valid: false,
          errors: validate.errors,
          message: 'Response does not match OpenAPI schema'
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        message: `Validation error: ${error.message}`,
        error
      };
    }
  }

  _resolveSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    // Handle $ref
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/components/schemas/', '');
      const refSchema = this.spec.components?.schemas?.[refPath];
      if (refSchema) {
        return this._resolveSchema(refSchema);
      }
    }

    // Handle allOf, anyOf, oneOf
    if (schema.allOf) {
      return {
        ...schema,
        allOf: schema.allOf.map(s => this._resolveSchema(s))
      };
    }

    if (schema.anyOf) {
      return {
        ...schema,
        anyOf: schema.anyOf.map(s => this._resolveSchema(s))
      };
    }

    if (schema.oneOf) {
      return {
        ...schema,
        oneOf: schema.oneOf.map(s => this._resolveSchema(s))
      };
    }

    // Recursively resolve nested schemas
    const resolved = { ...schema };
    for (const key in resolved) {
      if (typeof resolved[key] === 'object' && resolved[key] !== null) {
        resolved[key] = this._resolveSchema(resolved[key]);
      }
    }

    return resolved;
  }

  /**
   * Get all endpoints from the spec
   */
  getEndpoints() {
    const endpoints = [];
    for (const [path, pathItem] of Object.entries(this.spec.paths)) {
      for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
        if (pathItem[method]) {
          endpoints.push({ method: method.toUpperCase(), path });
        }
      }
    }
    return endpoints;
  }
}

// Export for use in tests
module.exports = OpenAPIValidator;

// CLI usage
if (require.main === module) {
  const specPath = process.argv[2] || path.join(__dirname, '..', 'docs', 'openapi.yaml');
  const validator = new OpenAPIValidator(specPath);
  
  console.log('OpenAPI Response Validator');
  console.log(`Spec: ${specPath}\n`);
  console.log(`Endpoints: ${validator.getEndpoints().length}`);
  console.log('Validator ready for use in tests.\n');
}

