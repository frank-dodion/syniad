import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// GET /api/docs/openapi.yaml - Serve OpenAPI specification
export async function GET(request: NextRequest) {
  try {
    const openApiPath = join(process.cwd(), 'docs', 'openapi.yaml');
    const spec = readFileSync(openApiPath, 'utf-8');
    
    return new Response(spec, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'OpenAPI spec not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

