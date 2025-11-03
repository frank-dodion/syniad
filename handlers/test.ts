import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithLambdaAuthorizer<any>
): Promise<APIGatewayProxyResultV2> => {
  try {
    const user = extractUserIdentity(event);
    
    // Debug: log event structure to help diagnose issues
    const requestContext = event.requestContext as any;
    console.log('Request context authorizer:', JSON.stringify(requestContext.authorizer, null, 2));
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Hello from TypeScript!',
        timestamp: new Date().toISOString(),
        event: {
          path: (event.requestContext as any).http?.path || (event.requestContext as any).path || event.rawPath || '/test',
          method: (event.requestContext as any).http?.method || (event.requestContext as any).httpMethod || 'GET'
        },
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        },
        debug: {
          hasAuthorizer: !!(requestContext.authorizer),
          authorizerType: typeof requestContext.authorizer,
          authorizerKeys: requestContext.authorizer ? Object.keys(requestContext.authorizer) : [],
          fullContext: JSON.stringify(requestContext.authorizer, null, 2)
        }
      })
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      })
    };
  }
};

