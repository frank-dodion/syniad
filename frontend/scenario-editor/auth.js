/**
 * Authentication handler - uses server-side auth proxy
 * Tokens are stored in httpOnly cookies, not accessible to JavaScript
 */

const API_BASE_URL = window.API_BASE_URL || 'https://dev.api.syniad.net';

/**
 * Check if user is authenticated by calling the /auth/me endpoint
 * Since tokens are in httpOnly cookies, we can't check directly
 */
async function isAuthenticated() {
    try {
        const response = await fetch(`${API_BASE_URL}/api-proxy/auth/me`, {
            method: 'GET',
            credentials: 'include'
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Get user info from the /auth/me endpoint
 */
async function getUserInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/api-proxy/auth/me`, {
            method: 'GET',
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            return data.user || null;
        }
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
    const loginUrl = `${API_BASE_URL}/api-proxy/auth/login?redirect_uri=${redirectUri}`;
    console.log('Login - Redirecting to:', loginUrl);
    // Use window.location.replace to ensure redirect happens
    window.location.replace(loginUrl);
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

