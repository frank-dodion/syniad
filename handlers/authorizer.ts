import { APIGatewayRequestAuthorizerEventV2, APIGatewayAuthorizerResult, APIGatewayAuthorizerResultContext } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Create JWT verifier (will be initialized on first use)
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * Lambda authorizer for API Gateway
 * Validates Cognito JWT tokens from the Authorization header
 */
export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2
): Promise<APIGatewayAuthorizerResult> => {
  // Allow OPTIONS requests (CORS preflight) without authentication
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return generatePolicy('anonymous', 'Allow', event.routeArn, {});
  }

  const userPoolId = process.env.USER_POOL_ID;
  const clientId = process.env.USER_POOL_CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new Error('USER_POOL_ID and USER_POOL_CLIENT_ID environment variables must be set');
  }

  // Initialize verifier on first use
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId,
    });
  }

  // Extract JWT token from Authorization header
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) {
    console.log('[AUTHORIZER] No Authorization header found');
    console.log('[AUTHORIZER] Available headers:', JSON.stringify(Object.keys(event.headers || {})));
    return generatePolicy('user', 'Deny', event.routeArn, {});
  }

  // Extract token (remove "Bearer " prefix if present)
  const token = authHeader.replace(/^Bearer\s+/i, '');
  
  // Debug logging
  console.log('[AUTHORIZER] Route:', event.routeArn);
  console.log('[AUTHORIZER] Method:', event.requestContext?.http?.method);
  console.log('[AUTHORIZER] Auth header length:', authHeader.length);
  console.log('[AUTHORIZER] Token length:', token.length);
  console.log('[AUTHORIZER] Token parts count:', token.split('.').length);
  console.log('[AUTHORIZER] Token first 50 chars:', token.substring(0, 50));
  console.log('[AUTHORIZER] Token last 50 chars:', token.substring(Math.max(0, token.length - 50)));

  try {
    // Verify and decode the JWT token
    const payload = await verifier.verify(token);

    // Extract user information from token payload
    // Convert to strings to ensure compatibility with APIGatewayAuthorizerResultContext
    const userId = String(payload.sub || ''); // Cognito user ID
    const email = payload.email ? String(payload.email) : '';
    const username = payload['cognito:username'] || payload.username ? String(payload['cognito:username'] || payload.username || '') : '';

    // Create context to pass user info to Lambda handlers
    // Context values must be string, number, boolean, null, or undefined
    const context: APIGatewayAuthorizerResultContext = {
      userId,
      email,
      username,
    };

    // Generate policy allowing access with user context
    // For HTTP APIs, use wildcard pattern to allow all methods and paths for this API
    // Route ARN format: arn:aws:execute-api:region:account-id:api-id/stage/HTTP_METHOD/path
    // We need: arn:aws:execute-api:region:account-id:api-id/stage/*/*
    const routeArn = event.routeArn || '';
    
    // Extract the base execution ARN (everything up to and including the stage)
    // Route ARN example: arn:aws:execute-api:us-east-1:054919302645:bwa6mdmi9k/dev/GET/test
    // We want: arn:aws:execute-api:us-east-1:054919302645:bwa6mdmi9k/dev/*/*
    const routeParts = routeArn.split('/');
    console.log('[AUTHORIZER] Route ARN parts:', JSON.stringify(routeParts));
    
    if (routeParts.length >= 2) {
      // Get the full ARN prefix (region:account:api-id) and stage
      // routeParts[0] = "arn:aws:execute-api:us-east-1:054919302645:bwa6mdmi9k"
      // routeParts[1] = "dev"
      const apiExecutionPrefix = routeParts[0]; // Full ARN prefix
      const stage = routeParts[1];
      // Use wildcard to allow all methods and paths
      const wildcardResource = `${apiExecutionPrefix}/${stage}/*/*`;
      
      console.log('[AUTHORIZER] ✓ Token verified successfully for user:', userId);
      console.log('[AUTHORIZER] Email:', email);
      console.log('[AUTHORIZER] Username:', username);
      console.log('[AUTHORIZER] Original route ARN:', routeArn);
      console.log('[AUTHORIZER] API execution prefix:', apiExecutionPrefix);
      console.log('[AUTHORIZER] Stage:', stage);
      console.log('[AUTHORIZER] Policy resource (wildcard):', wildcardResource);
      return generatePolicy(userId, 'Allow', wildcardResource, context);
    } else {
      // Fallback to exact route ARN if we can't parse it
      console.log('[AUTHORIZER] ⚠ Could not parse route ARN, using exact:', routeArn);
      console.log('[AUTHORIZER] ✓ Token verified successfully for user:', userId);
      return generatePolicy(userId, 'Allow', routeArn, context);
    }
  } catch (error) {
    console.error('[AUTHORIZER] ✗ JWT verification failed:', error);
    console.error('[AUTHORIZER] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return generatePolicy('user', 'Deny', event.routeArn || '*', {});
  }
};

/**
 * Generate an IAM policy for API Gateway with context
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context: APIGatewayAuthorizerResultContext
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource
        }
      ]
    },
    context // This context will be available in Lambda handlers
  };
}
