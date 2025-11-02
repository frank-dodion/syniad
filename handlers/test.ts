import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { extractUserIdentity } from '../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const user = extractUserIdentity(event);
    
    // Debug: log event structure to help diagnose issues
    console.log('Request context authorizer:', JSON.stringify(event.requestContext.authorizer, null, 2));
    
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
          path: event.path,
          httpMethod: event.httpMethod
        },
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email
        },
        debug: {
          authorizerKeys: event.requestContext.authorizer ? Object.keys(event.requestContext.authorizer) : []
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

