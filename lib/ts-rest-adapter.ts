/**
 * ts-rest adapter for Next.js App Router
 * Validates requests and responses against the contract
 */

import { NextRequest, NextResponse } from 'next/server';
import { contract } from '@/shared/contract';
import { extractUserIdentity } from './api-auth';
import { z } from 'zod';

type ContractRoute = typeof contract[keyof typeof contract];

/**
 * Validate request body against contract
 */
export function validateRequestBody(
  route: ContractRoute,
  body: unknown
): { valid: true; data: any } | { valid: false; error: string } {
  if (!('body' in route) || !route.body) {
    return { valid: true, data: undefined };
  }

  try {
    const schema = route.body as z.ZodTypeAny;
    const result = schema.safeParse(body);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return {
      valid: false,
      error: `Invalid request body: ${result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Validate query parameters against contract
 */
export function validateQueryParams(
  route: ContractRoute,
  searchParams: URLSearchParams
): { valid: true; data: any } | { valid: false; error: string } {
  if (!('query' in route) || !route.query) {
    return { valid: true, data: undefined };
  }

  try {
    // Convert URLSearchParams to object
    const queryObj: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryObj[key] = value;
    });

    const schema = route.query as z.ZodTypeAny;
    const result = schema.safeParse(queryObj);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return {
      valid: false,
      error: `Invalid query parameters: ${result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Validate path parameters against contract
 */
export function validatePathParams(
  route: ContractRoute,
  params: Record<string, string>
): { valid: true; data: any } | { valid: false; error: string } {
  if (!('pathParams' in route) || !route.pathParams) {
    return { valid: true, data: undefined };
  }

  try {
    const schema = route.pathParams as z.ZodTypeAny;
    const result = schema.safeParse(params);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return {
      valid: false,
      error: `Invalid path parameters: ${result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Validate and format response against contract
 */
export function validateResponse(
  route: ContractRoute,
  statusCode: number,
  body: unknown
): { valid: true; data: any } | { valid: false; error: string } {
  if (!('responses' in route)) {
    return { valid: true, data: body };
  }

  const responseSchema = route.responses[statusCode as keyof typeof route.responses];
  if (!responseSchema) {
    // Status code not defined in contract - allow it but don't validate
    return { valid: true, data: body };
  }

  try {
    const schema = responseSchema as z.ZodTypeAny;
    const result = schema.safeParse(body);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return {
      valid: false,
      error: `Invalid response body: ${result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  statusCode: number,
  error: string,
  user?: ReturnType<typeof extractUserIdentity> extends Promise<infer T> ? T : never
): NextResponse {
  const errorBody = { error, ...(user && { user }) };
  return NextResponse.json(errorBody, {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(
  statusCode: number,
  body: any,
  user?: ReturnType<typeof extractUserIdentity> extends Promise<infer T> ? T : never
): NextResponse {
  const responseBody = user ? { ...body, user } : body;
  return NextResponse.json(responseBody, {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

