import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import https from 'https';
import { URL } from 'url';

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';
const API_BASE_URL = process.env.API_BASE_URL || '';
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || '';
const COGNITO_REGION = process.env.COGNITO_REGION || 'us-east-1';
const FRONTEND_DOMAIN = process.env.FRONTEND_DOMAIN || 'dev.app.syniad.net';

// Cookie names
const ID_TOKEN_COOKIE = 'id_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Create JWT verifier
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: 'id',
      clientId: CLIENT_ID,
    });
  }
  return verifier;
}

/**
 * Parse cookies from request
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  
  return cookies;
}

/**
 * Set httpOnly cookie in response
 */
function setCookie(name: string, value: string, maxAge: number = 86400): string {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

/**
 * Clear cookie
 */
function clearCookie(name: string): string {
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/**
 * Validate token from cookie
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    await getVerifier().verify(token);
    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

/**
 * Extract user info from token
 */
function getUserFromToken(token: string): { userId: string; username: string; email?: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return {
      userId: payload.sub,
      username: payload['cognito:username'] || payload.sub,
      email: payload.email
    };
  } catch (error) {
    console.error('Error parsing token:', error);
    return null;
  }
}

/**
 * Make HTTP request to backend API
 */
function proxyRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const apiUrl = new URL(path, API_BASE_URL);
    const options = {
      hostname: apiUrl.hostname,
      port: apiUrl.port || 443,
      path: apiUrl.pathname + apiUrl.search,
      method: method,
      headers: {
        ...headers,
        'Host': apiUrl.hostname,
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const responseHeaders: Record<string, string> = {};
        Object.keys(res.headers).forEach(key => {
          const value = res.headers[key];
          if (value) {
            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
          }
        });
        resolve({
          statusCode: res.statusCode || 500,
          body: data,
          headers: responseHeaders
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Handle login - redirect to Cognito hosted UI
 */
function handleLogin(event: APIGatewayProxyEventV2): APIGatewayProxyResultV2 {
  // The callback URL is the auth proxy callback endpoint on the API domain
  const apiDomain = API_BASE_URL.replace('https://', '').replace('http://', '');
  const callbackUrl = `${API_BASE_URL}/api-proxy/auth/callback`;
  
  // Get the frontend URL to redirect to after auth (from query param or default)
  const redirectUri = event.queryStringParameters?.redirect_uri;
  const frontendRedirect = redirectUri || 
    `https://${FRONTEND_DOMAIN}/scenario-editor/`;
  
  const cognitoUrl = `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/authorize?` +
    `client_id=${CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
    `state=${encodeURIComponent(frontendRedirect)}&` +
    `scope=email+openid+profile`;

  return {
    statusCode: 302,
    headers: {
      'Location': cognitoUrl
    },
    body: ''
  };
}

/**
 * Handle OAuth callback - exchange code for tokens
 */
async function handleCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const code = event.queryStringParameters?.code || (event.rawQueryString ? new URLSearchParams(event.rawQueryString).get('code') : null);
  if (!code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing authorization code' })
    };
  }

  // Use the API base URL for the callback (must match what was sent to Cognito)
  const redirectUri = `${API_BASE_URL}/api-proxy/auth/callback`;

  // Exchange code for tokens
  const tokenUrl = `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com/oauth2/token`;
  const tokenData = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code: code,
    redirect_uri: redirectUri
  }).toString();

  try {
    const tokenResponse = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const url = new URL(tokenUrl);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            body: data
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(tokenData);
      req.end();
    });

    if (tokenResponse.statusCode !== 200) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusCode}`);
    }

    const tokens = JSON.parse(tokenResponse.body);
    const idToken = tokens.id_token;
    const refreshToken = tokens.refresh_token;

    // Set cookies and redirect to frontend app
    const state = event.queryStringParameters?.state;
    const appUrl = state || 
      `https://${FRONTEND_DOMAIN}/scenario-editor/`;
    
    return {
      statusCode: 302,
      headers: {
        'Location': appUrl,
        'Set-Cookie': [
          setCookie(ID_TOKEN_COOKIE, idToken, 86400), // 24 hours
          refreshToken ? setCookie(REFRESH_TOKEN_COOKIE, refreshToken, 2592000) : '' // 30 days
        ].filter(Boolean).join(', ')
      },
      body: ''
    };
  } catch (error) {
    console.error('Token exchange error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to exchange authorization code' })
    };
  }
}

/**
 * Handle logout
 */
function handleLogout(): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': [
        clearCookie(ID_TOKEN_COOKIE),
        clearCookie(REFRESH_TOKEN_COOKIE)
      ].join(', ')
    },
    body: JSON.stringify({ message: 'Logged out successfully' })
  };
}

/**
 * Handle authenticated API proxy
 */
async function handleProxy(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cookies = parseCookies(event.cookies?.join('; ') || event.headers.cookie || event.headers['cookie']);
  const idToken = cookies[ID_TOKEN_COOKIE];

  if (!idToken) {
    return {
      statusCode: 401,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Not authenticated' })
    };
  }

  // Validate token
  const isValid = await validateToken(idToken);
  if (!isValid) {
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookie(ID_TOKEN_COOKIE),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Invalid or expired token' })
    };
  }

  // Extract API path from request
  // Path format: /api-proxy/scenarios -> /scenarios
  const requestContext = event.requestContext as any;
  const requestPath = requestContext?.http?.path || event.rawPath || '/';
  let apiPath = requestPath.replace('/api-proxy', '') || '/';
  
  // Handle path parameters - replace {param} with actual values
  if (event.pathParameters) {
    Object.entries(event.pathParameters).forEach(([key, value]) => {
      if (value) {
        apiPath = apiPath.replace(`{${key}}`, value);
      }
    });
  }
  
  // Add query string parameters if present
  if (event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0) {
    const queryString = new URLSearchParams(event.queryStringParameters as Record<string, string>).toString();
    apiPath += `?${queryString}`;
  }
  
  // Proxy request to backend API
  try {
    const requestContext = event.requestContext as any;
    const requestMethod = requestContext?.http?.method || 'GET';
    const response = await proxyRequest(
      requestMethod,
      apiPath,
      {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': event.headers['content-type'] || event.headers['Content-Type'] || 'application/json'
      },
      event.body || undefined
    );

    // Filter out headers that shouldn't be forwarded
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true'
    };
    
    // Copy relevant response headers
    if (response.headers['content-type']) {
      responseHeaders['Content-Type'] = response.headers['content-type'];
    }

    return {
      statusCode: response.statusCode,
      headers: responseHeaders,
      body: response.body
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Failed to proxy request' })
    };
  }
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const requestContext = event.requestContext as any;
  const path = requestContext?.http?.path || event.rawPath || '/';
  const method = requestContext?.http?.method || event.requestContext?.http?.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: ''
    };
  }

  // Route to appropriate handler
  if (path === '/api-proxy/auth/login' || path === '/auth/login') {
    return handleLogin(event);
  }

  if (path === '/api-proxy/auth/callback' || path === '/auth/callback') {
    return await handleCallback(event);
  }

  if (path === '/api-proxy/auth/logout' || path === '/auth/logout') {
    return handleLogout();
  }

  // All other paths are API proxy requests
  return await handleProxy(event);
};

