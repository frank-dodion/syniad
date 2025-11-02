import { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

export interface UserIdentity {
  userId?: string;
  username?: string;
  email?: string;
}

/**
 * Extract user identity from API Gateway request context
 * Supports both REST API (v1) and HTTP API (v2) event types
 */
export function extractUserIdentity(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): UserIdentity {
  const authorizer = event.requestContext.authorizer;
  
  // For HTTP API v2 with payload format 2.0, context is directly on authorizer
  // For REST API v1, it might be nested under lambda
  const userId = (authorizer as any)?.userId || (authorizer as any)?.lambda?.userId;
  const username = (authorizer as any)?.username || (authorizer as any)?.lambda?.username || '';
  const email = (authorizer as any)?.email || (authorizer as any)?.lambda?.email || '';
  
  return {
    userId,
    username,
    email
  };
}

