import { APIGatewayProxyEvent } from 'aws-lambda';

export interface UserIdentity {
  userId?: string;
  username?: string;
  email?: string;
}

/**
 * Extract user identity from API Gateway request context
 */
export function extractUserIdentity(event: APIGatewayProxyEvent): UserIdentity {
  const authorizer = event.requestContext.authorizer;
  
  return {
    userId: authorizer?.userId || authorizer?.lambda?.userId,
    username: authorizer?.username || authorizer?.lambda?.username || '',
    email: authorizer?.email || authorizer?.lambda?.email || ''
  };
}

