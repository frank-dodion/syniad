'use client';

import { createAuthClient } from "better-auth/react";
import { useState, useEffect } from "react";

// Use window.location.origin for client-side - always correct at runtime
// No need for build-time environment variables - the browser knows its own origin
const getBaseURL = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }
  // Always use window.location.origin - it's always correct and doesn't require build-time config
  return window.location.origin;
};

const authClient = createAuthClient({
  baseURL: getBaseURL(),
  basePath: '/api/auth',
});

/**
 * CRITICAL REQUIREMENT: User ID must always be Cognito `sub` (from ID token)
 * Never use Better Auth's internal session.user.id
 * See docs/AUTH-REQUIREMENTS.md for details
 */
export interface User {
  userId: string; // MUST be Cognito `sub` - never Better Auth's internal ID
  username: string;
  email?: string;
}

/**
 * Decode Cognito ID token to extract 'sub' (user ID)
 * This ensures we use the immutable Cognito sub, not Better Auth's internal ID
 */
function decodeCognitoUserId(idToken: string | undefined): string | null {
  if (!idToken) {
    return null;
  }
  
  try {
    // JWT tokens have 3 parts separated by dots: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      console.error('[auth-client] Invalid JWT format. Expected 3 parts separated by dots, got:', parts.length);
      return null;
    }
    
    // Decode the payload (second part)
    const payload = JSON.parse(atob(parts[1]));
    
    // CRITICAL: sub claim is required - fail if missing
    if (!payload.sub) {
      console.error('[auth-client] ID token missing required "sub" claim. Token:', {
        hasPayload: !!payload,
        payloadKeys: Object.keys(payload || {}),
        tokenPreview: idToken.substring(0, 50) + '...'
      });
      return null;
    }
    
    return payload.sub;
  } catch (error) {
    console.error('[auth-client] Failed to decode ID token:', error);
    return null;
  }
}

/**
 * Extract Cognito userId from session
 * Fetches the ID token from server and decodes the 'sub' claim
 */
async function extractCognitoUserId(): Promise<string | null> {
  try {
    const tokenResponse = await fetch('/api/docs/session-token', {
      credentials: 'include'
    });
    
    if (!tokenResponse.ok) {
      return null;
    }
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.authenticated || !tokenData.token) {
      return null;
    }
    
    return decodeCognitoUserId(tokenData.token);
  } catch (error) {
    return null;
  }
}

/**
 * Get user info from client-side (using Better Auth)
 * This is a React hook - must be called from a React component
 */
export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cognitoUserId, setCognitoUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const s = await authClient.getSession();
        const sessionData = (s && typeof s === 'object' && 'data' in s) 
          ? (s as any).data 
          : (s as any);
        
        if (!mounted) return;
        
        setSession(sessionData);
        
        // Try to extract Cognito userId if session exists
        if (sessionData?.user) {
          const userId = await extractCognitoUserId();
          if (mounted) {
            setCognitoUserId(userId);
          }
        } else {
          if (mounted) {
            setCognitoUserId(null);
          }
        }
        
        if (mounted) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[Better Auth Client] Session error:', error);
        if (mounted) {
          setSession(null);
          setCognitoUserId(null);
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Check again when page becomes visible (user might be returning from Cognito)
    const handleVisibilityChange = () => {
      if (!document.hidden && mounted) {
        checkSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    user: session?.user && cognitoUserId ? {
      userId: cognitoUserId,
      username: session.user.name || session.user.email || '',
      email: session.user.email,
    } as User : null,
    isLoading,
    isAuthenticated: !!session?.user && !!cognitoUserId,
    session,
  };
}

/**
 * Get user info from client-side
 */
export async function getUserInfo(): Promise<User | null> {
  try {
    // Use Better Auth's built-in getSession() method
    const s = await authClient.getSession();
    const sessionData = (s && typeof s === 'object' && 'data' in s) 
      ? (s as any).data 
      : (s as any);
    
    if (sessionData && typeof sessionData === 'object' && 'user' in sessionData && sessionData.user) {
      // Extract Cognito userId from ID token
      const cognitoUserId = await extractCognitoUserId();
      if (!cognitoUserId) {
        console.warn('[auth-client] Could not extract Cognito userId');
        return null;
      }
      
      return {
        userId: cognitoUserId, // Use Cognito sub, not Better Auth's internal ID
        username: sessionData.user.name || sessionData.user.email || '',
        email: sessionData.user.email,
      };
    }
  } catch (error) {
    console.error('[Better Auth Client] Error getting user info:', error);
  }
  return null;
}

/**
 * Check if user is authenticated (client-side)
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getUserInfo();
  return !!user;
}

/**
 * Login - redirects to Cognito authentication
 */
let isLoggingIn = false;

export async function login(redirectUri?: string) {
  // Prevent multiple simultaneous login attempts
  if (isLoggingIn) {
    return;
  }
  
  isLoggingIn = true;
  
  try {
    // Store redirect path if provided
    if (redirectUri && typeof window !== "undefined") {
      try {
        const url = new URL(redirectUri);
        const redirectPath = url.pathname + url.search + url.hash;
        if (redirectPath && redirectPath !== "/") {
          sessionStorage.setItem("authRedirect", redirectPath);
        }
      } catch (e) {
        if (redirectUri.startsWith("/")) {
          sessionStorage.setItem("authRedirect", redirectUri);
        }
      }
    }
    
    const baseURL = getBaseURL();
    
    // Better Auth's signIn.social() returns a URL that we need to redirect to
    // Call it once and redirect to the returned URL
    const result = await authClient.signIn.social({
      provider: "cognito",
      callbackURL: baseURL,
    });
    
    if (result && (result as any).error) {
      alert(`Login failed: ${(result as any).error.message || 'Unknown error'}`);
      isLoggingIn = false;
      return;
    }
    
    const redirectUrl = (result as any)?.url || (result as any)?.data?.url;
    if (redirectUrl) {
      // Redirect to Cognito OAuth URL - Better Auth will handle the callback
      // Don't reset isLoggingIn here - let the redirect happen
      window.location.href = redirectUrl;
    } else {
      console.error('[login] No redirect URL returned - Cognito provider may not be configured');
      alert('Login failed: Cognito provider not configured. Please check environment variables.');
      isLoggingIn = false;
    }
  } catch (error: any) {
    console.error('[login] Error:', error);
    alert(`Login failed: ${error?.message || 'Unknown error'}`);
    isLoggingIn = false;
  }
}

/**
 * Logout - completely logs out from both Better Auth and Cognito
 * This ensures the user is logged out at Cognito level, not just locally
 */
export async function logout() {
  // First, clear Better Auth session
  // If this fails, log the error but still attempt Cognito logout
  try {
    await authClient.signOut();
  } catch (error) {
    console.error('[logout] Failed to clear Better Auth session:', error);
    // Continue to Cognito logout - we still want to log out from Cognito
  }
  
  // Get Cognito logout URL from server
  const baseURL = getBaseURL();
  const configResponse = await fetch(`${baseURL}/api/auth/logout-config`, {
    credentials: 'include',
    cache: 'no-store'
  });
  
  if (!configResponse.ok) {
    console.error('[logout] Failed to get Cognito logout configuration:', {
      status: configResponse.status,
      statusText: configResponse.statusText
    });
    // Still redirect to home - Better Auth session may be cleared
    window.location.href = window.location.origin;
    return;
  }
  
  const config = await configResponse.json();
  
  if (!config.logoutUrl) {
    console.error('[logout] Cognito logout URL not available in configuration:', config);
    // Still redirect to home - Better Auth session may be cleared
    window.location.href = window.location.origin;
    return;
  }
  
  // Redirect to Cognito logout URL
  // Cognito will handle the logout and redirect back to our app (logout_uri)
  console.log('[logout] Redirecting to Cognito logout URL');
  window.location.href = config.logoutUrl;
}
