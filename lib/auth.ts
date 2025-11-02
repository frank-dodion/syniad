import { APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda';

export interface UserIdentity {
  userId?: string;
  username?: string;
  email?: string;
}

/**
 * Extract user identity from API Gateway request context
 * Supports both REST API (v1) and HTTP API (v2) event types
 */
export function extractUserIdentity(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithLambdaAuthorizer<any>
): UserIdentity {
  // Check if this is a V2 event with authorizer
  const requestContext = event.requestContext as any;
  const authorizer = requestContext.authorizer;
  
  // For HTTP API v2 with Lambda authorizer (payload format 2.0), context is at authorizer.lambda
  // For REST API v1, context is directly on authorizer or at authorizer.lambda
  const lambdaContext = (authorizer as any)?.lambda;
  const userId = lambdaContext?.userId || (authorizer as any)?.userId;
  const username = lambdaContext?.username || (authorizer as any)?.username || '';
  const email = lambdaContext?.email || (authorizer as any)?.email || '';
  
  return {
    userId,
    username,
    email
  };
}

