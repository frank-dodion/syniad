/**
 * Authentication handler - uses server-side auth proxy
 * Tokens are stored in httpOnly cookies, not accessible to JavaScript
 */

const API_BASE_URL = window.API_BASE_URL || 'https://dev.api.syniad.net';

/**
 * Check if user is authenticated by making a test request
 * Since tokens are in httpOnly cookies, we can't check directly
 */
async function isAuthenticated() {
    try {
        // Make a lightweight request to check auth status
        const response = await fetch(`${API_BASE_URL}/api-proxy/scenarios?limit=1`, {
            method: 'GET',
            credentials: 'include'
        });
        return response.status !== 401;
    } catch (e) {
        return false;
    }
}

/**
 * Get user info - requires an API call since we can't read token from cookie
 */
async function getUserInfo() {
    try {
        // We'll get user info from the API response or make a dedicated endpoint
        // For now, return null and let the app handle it
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Login - redirect to auth proxy login endpoint
 */
function login() {
    const redirectUri = encodeURIComponent(window.location.href);
    window.location.href = `${API_BASE_URL}/api-proxy/auth/login?redirect_uri=${redirectUri}`;
}

/**
 * Logout - call auth proxy logout endpoint
 */
async function logout() {
    try {
        await fetch(`${API_BASE_URL}/api-proxy/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (e) {
        console.error('Logout error:', e);
    }
    // Redirect to clear any state
    window.location.href = window.location.pathname;
}

/**
 * Initialize authentication on page load
 */
async function initAuth() {
    const authStatusText = document.getElementById('auth-status-text');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Check auth status asynchronously
    const authenticated = await isAuthenticated();
    
    if (authenticated) {
        authStatusText.textContent = 'Logged in';
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
    } else {
        authStatusText.textContent = 'Not logged in';
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
    }
    
    // Set up event listeners
    loginBtn.addEventListener('click', login);
    logoutBtn.addEventListener('click', logout);
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}

