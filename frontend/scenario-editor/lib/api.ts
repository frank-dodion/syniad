/**
 * API client for scenario CRUD operations
 * Works both client-side and server-side
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://dev.api.syniad.net';

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
    // Use Better Auth's built-in session endpoint (handled by [...all] route)
    // Note: This is for API token extraction, not for UI auth state
    const response = await fetch('/api/auth/session', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      // Better Auth returns { data: { session, user }, error: null }
      const sessionData = data?.data || data;
      // The Cognito ID token is stored in session.idToken (from callbacks)
      // The API authorizer expects the ID token
      const idToken = sessionData?.session?.idToken || sessionData?.idToken || null;
      
      if (!idToken) {
        console.warn('[API Client] No ID token found in session. Session data:', {
          hasSession: !!sessionData?.session,
          hasData: !!sessionData,
          sessionKeys: sessionData?.session ? Object.keys(sessionData.session) : [],
          dataKeys: sessionData ? Object.keys(sessionData) : [],
        });
      }
      
      return idToken;
    } else {
      console.error('[API Client] Failed to get session:', response.status, response.statusText);
      return null;
    }
  } catch (e) {
    console.error('[API Client] Error getting access token:', e);
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
  
  // Only add Content-Type header for requests with a body
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Use provided token or fetch from session
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
    // Network error (CORS, connection failed, etc.)
    console.error('[API Client] Fetch error:', error);
    throw new Error(`Network error: ${error.message || 'Failed to fetch'}`);
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', Message: null }));
    console.error('[API Client] API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
      url,
      hasToken: !!token,
      tokenLength: token?.length || 0,
    });
    
    // If 403 and no token, suggest user needs to log in
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
  let path = `/scenarios?limit=${limit}`;
  if (nextToken) {
    path += `&nextToken=${encodeURIComponent(nextToken)}`;
  }
  return await apiRequest('GET', path, undefined, accessToken);
}

/**
 * Get a specific scenario by ID
 */
export async function getScenario(scenarioId: string, accessToken?: string | null): Promise<{ scenario: Scenario }> {
  return await apiRequest('GET', `/scenarios/${scenarioId}`, undefined, accessToken);
}

/**
 * Create a new scenario
 */
export async function createScenario(scenarioData: Omit<Scenario, 'scenarioId' | 'createdAt'>, accessToken?: string | null): Promise<{ scenario: Scenario }> {
  return await apiRequest('POST', '/scenarios', scenarioData, accessToken);
}

/**
 * Update an existing scenario
 */
export async function updateScenario(
  scenarioId: string,
  scenarioData: Partial<Scenario>,
  accessToken?: string | null
): Promise<{ scenario: Scenario }> {
  return await apiRequest('PUT', `/scenarios/${scenarioId}`, scenarioData, accessToken);
}

/**
 * Delete a scenario
 */
export async function deleteScenario(scenarioId: string, accessToken?: string | null): Promise<void> {
  return await apiRequest('DELETE', `/scenarios/${scenarioId}`, undefined, accessToken);
}

