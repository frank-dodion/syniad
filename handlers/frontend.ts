import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Handler for serving frontend static files
 * Serves the scenario editor and any other frontend apps
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const path = (event.requestContext as any).http.path;
    
    // Handle root path - redirect to scenario-editor
    if (path === '/' || path === '') {
      return {
        statusCode: 302,
        headers: {
          'Location': '/scenario-editor/'
        },
        body: ''
      };
    }
    
    // Remove leading slash and determine file path
    let filePath = path.startsWith('/') ? path.slice(1) : path;
    
    // Handle directory paths - serve index.html
    if (filePath.endsWith('/') || !filePath.includes('.')) {
      if (filePath.endsWith('/')) {
        filePath = filePath.slice(0, -1);
      }
      filePath = `${filePath}/index.html`;
    }
    
    // Ensure we're only serving from scenario-editor directory
    if (!filePath.startsWith('scenario-editor/')) {
      // If accessing root scenario-editor, serve index.html
      if (filePath === 'scenario-editor') {
        filePath = 'scenario-editor/index.html';
      } else {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'text/plain' },
          body: 'Not Found'
        };
      }
    }
    
    // Determine content type based on file extension
    const contentType = getContentType(filePath);
    
    // Try to read the file from the Lambda package
    let fileContent: string | Buffer | null = null;
    const possiblePaths = [
      join(__dirname, 'frontend', filePath), // Primary location (from build)
      join(process.cwd(), 'frontend', filePath), // Current working directory
      join(__dirname, '..', 'frontend', filePath), // Relative to handler
      `/opt/frontend/${filePath}` // Lambda layer location (if used)
    ];
    
    let found = false;
    for (const fullPath of possiblePaths) {
      try {
        // Read as binary for non-text files (images, etc.)
        if (isBinaryFile(filePath)) {
          fileContent = readFileSync(fullPath);
        } else {
          fileContent = readFileSync(fullPath, 'utf8');
        }
        found = true;
        break;
      } catch (error) {
        // Continue to next path
      }
    }
    
    if (!found || fileContent === null) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/plain' },
        body: `File not found: ${filePath}`
      };
    }
    
    // Handle special files that need processing
    if (filePath.endsWith('index.html')) {
      fileContent = processIndexHtml(fileContent as string, event);
    }
    
    // Return the file
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': isStaticAsset(filePath) ? 'public, max-age=3600' : 'no-cache',
        'Access-Control-Allow-Origin': '*'
      },
      body: typeof fileContent === 'string' ? fileContent : fileContent.toString('base64'),
      isBase64Encoded: typeof fileContent !== 'string'
    };
  } catch (error) {
    console.error('Error serving frontend:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

function getContentType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject'
  };
  return contentTypes[ext || ''] || 'application/octet-stream';
}

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const binaryExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot'];
  return binaryExtensions.includes(ext || '');
}

function isStaticAsset(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const staticExtensions = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf'];
  return staticExtensions.includes(ext || '');
}

function processIndexHtml(html: string, event: APIGatewayProxyEventV2): string {
  // Get API base URL from the request
  const host = event.headers?.host || (event.requestContext as any)?.domainName || '';
  const protocol = event.headers?.['x-forwarded-proto'] || 
                   event.headers?.['X-Forwarded-Proto'] || 'https';
  const apiBaseUrl = `${protocol}://${host.replace(/^app\./, 'api.')}`;
  
  // Replace API_BASE_URL placeholder if it exists
  html = html.replace(/window\.API_BASE_URL\s*=\s*['"][^'"]*['"]/g, `window.API_BASE_URL = "${apiBaseUrl}"`);
  
  return html;
}

