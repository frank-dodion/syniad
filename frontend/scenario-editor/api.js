/**
 * API client for scenario CRUD operations
 * Uses auth proxy which handles authentication server-side via httpOnly cookies
 */

const API_CONFIG = {
    // Use auth proxy endpoint - tokens are handled server-side via cookies
    baseUrl: window.API_BASE_URL || 'https://dev.api.syniad.net'
};

/**
 * Make an authenticated API request through auth proxy
 */
async function apiRequest(method, path, body = null) {
    // All requests go through the auth proxy
    const proxyPath = `/api-proxy${path}`;
    const url = `${API_CONFIG.baseUrl}${proxyPath}`;
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include' // Important: include cookies in request
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
async function getAllScenarios(limit = 100, nextToken = null) {
    let path = `/scenarios?limit=${limit}`;
    if (nextToken) {
        path += `&nextToken=${encodeURIComponent(nextToken)}`;
    }
    return await apiRequest('GET', path);
}

/**
 * Get a specific scenario by ID
 */
async function getScenario(scenarioId) {
    return await apiRequest('GET', `/scenarios/${scenarioId}`);
}

/**
 * Create a new scenario
 */
async function createScenario(scenarioData) {
    return await apiRequest('POST', '/scenarios', scenarioData);
}

/**
 * Update an existing scenario
 */
async function updateScenario(scenarioId, scenarioData) {
    return await apiRequest('PUT', `/scenarios/${scenarioId}`, scenarioData);
}

/**
 * Delete a scenario
 */
async function deleteScenario(scenarioId) {
    return await apiRequest('DELETE', `/scenarios/${scenarioId}`);
}

