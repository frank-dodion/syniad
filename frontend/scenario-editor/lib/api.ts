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
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/get-session', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      // Better Auth stores tokens in session.accessToken
      return data.session?.accessToken || data.accessToken || null;
    }
    return null;
  } catch (e) {
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
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
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
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `API request failed: ${response.status} ${response.statusText}`);
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

