import { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult, APIGatewayAuthorizerContext } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Create JWT verifier (will be initialized on first use)
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

/**
 * Lambda authorizer for API Gateway
 * Validates Cognito JWT tokens from the Authorization header
 */
export const handler = async (
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  // Allow OPTIONS requests (CORS preflight) without authentication
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return generatePolicy('anonymous', 'Allow', event.methodArn, {});
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
    return generatePolicy('user', 'Deny', event.methodArn, {});
  }

  // Extract token (remove "Bearer " prefix if present)
  const token = authHeader.replace(/^Bearer\s+/i, '');

  try {
    // Verify and decode the JWT token
    const payload = await verifier.verify(token);

    // Extract user information from token payload
    const userId = payload.sub; // Cognito user ID
    const email = payload.email || '';
    const username = payload['cognito:username'] || payload.username || '';

    // Create context to pass user info to Lambda handlers
    const context: APIGatewayAuthorizerContext = {
      userId,
      email,
      username,
    };

    // Generate policy allowing access with user context
    return generatePolicy(userId, 'Allow', event.methodArn, context);
  } catch (error) {
    console.error('JWT verification failed:', error);
    return generatePolicy('user', 'Deny', event.methodArn, {});
  }
};

/**
 * Generate an IAM policy for API Gateway with context
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context: APIGatewayAuthorizerContext
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
