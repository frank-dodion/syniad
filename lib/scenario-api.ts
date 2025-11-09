/**
 * API client for scenario CRUD operations (client-side)
 * Uses the same API routes as the server-side API
 */

import { createAuthClient } from "better-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Better Auth client for getting session tokens
const authClient = typeof window !== 'undefined' 
  ? createAuthClient({
      baseURL: window.location.origin,
      basePath: '/api/auth',
    })
  : null;

export interface Scenario {
  scenarioId: string;
  title: string;
  description: string;
  columns: number;
  rows: number;
  turns: number;
  hexes?: Array<{
    row: number;
    column: number;
    terrain: string;
  }>;
  createdAt?: string;
}

export interface ScenariosResponse {
  scenarios: Scenario[];
  count: number;
  hasMore: boolean;
  nextToken?: string;
}

/**
 * Get access token from Better Auth session (client-side)
 * Returns the Cognito ID token for API authentication
 */
async function getAccessToken(): Promise<string | null> {
  try {
    if (!authClient || typeof window === 'undefined') {
      return null;
    }
    
    const sessionResponse = await authClient.getSession();
    const sessionData = (sessionResponse && typeof sessionResponse === 'object' && 'data' in sessionResponse)
      ? (sessionResponse as any).data
      : (sessionResponse as any);
    
    // Check if user is authenticated
    if (!sessionData?.user) {
      // No session - user not logged in, return null silently
      return null;
    }
    
    // Try multiple possible paths for the ID token
    // Better Auth client might return: { data: { session: { idToken, ... }, user: {...} } }
    // or: { data: { idToken, user: {...} } }
    // or: { session: { idToken, ... }, user: {...} }
    let idToken = sessionData?.session?.idToken 
      || sessionData?.idToken 
      || (sessionData?.session && (sessionData.session as any).idToken)
      || null;
    
    // If ID token is not in the session data, try fetching it from the session token endpoint
    // This endpoint extracts the ID token from the server-side session
    if (!idToken) {
      try {
        const tokenResponse = await fetch('/api/docs/session-token', {
          credentials: 'include'
        });
        const tokenData = await tokenResponse.json();
        if (tokenData.authenticated && tokenData.token) {
          idToken = tokenData.token;
        }
      } catch (fetchError) {
        // Silently fail - we'll try without token and let the API return 401
      }
    }
    
    return idToken;
  } catch (e) {
    // Silently return null - the API will handle authentication errors
    return null;
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest(
  method: string,
  path: string,
  body?: any,
  accessToken?: string | null
): Promise<any> {
  const url = `${API_BASE_URL}${path}`;
  
  const headers: Record<string, string> = {};
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  const token = accessToken || await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error: any) {
    console.error('[Scenario API Client] Fetch error:', error);
    throw new Error(`Network error: ${error.message || 'Failed to fetch'}`);
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', Message: null }));
    console.error('[Scenario API Client] API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
      url,
    });
    
    if (response.status === 403 && !token) {
      throw new Error('Authentication required. Please log in.');
    }
    
    throw new Error(errorData.error || errorData.Message || `API request failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Get all scenarios
 */
export async function getAllScenarios(
  limit: number = 100,
  nextToken?: string | null,
  accessToken?: string | null
): Promise<ScenariosResponse> {
  let path = `/api/scenarios?limit=${limit}`;
  if (nextToken) {
    path += `&nextToken=${encodeURIComponent(nextToken)}`;
  }
  return await apiRequest('GET', path, undefined, accessToken);
}

/**
 * Get a specific scenario by ID
 */
export async function getScenario(scenarioId: string, accessToken?: string | null): Promise<{ scenario: Scenario }> {
  return await apiRequest('GET', `/api/scenarios/${scenarioId}`, undefined, accessToken);
}

/**
 * Create a new scenario
 */
export async function createScenario(scenarioData: Omit<Scenario, 'scenarioId' | 'createdAt'>, accessToken?: string | null): Promise<{ scenario: Scenario }> {
  return await apiRequest('POST', '/api/scenarios', scenarioData, accessToken);
}

/**
 * Update an existing scenario
 */
export async function updateScenario(
  scenarioId: string,
  scenarioData: Partial<Scenario>,
  accessToken?: string | null
): Promise<{ scenario: Scenario }> {
  return await apiRequest('PUT', `/api/scenarios/${scenarioId}`, scenarioData, accessToken);
}

/**
 * Delete a scenario
 */
export async function deleteScenario(scenarioId: string, accessToken?: string | null): Promise<void> {
  return await apiRequest('DELETE', `/api/scenarios/${scenarioId}`, undefined, accessToken);
}

