'use client';

import { createAuthClient } from "better-auth/react";
import { useState, useEffect } from "react";

// Use the same baseURL logic as the server-side auth configuration
// This ensures the OAuth redirect_uri matches what's configured in Cognito
const getBaseURL = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }
  // In production, use the environment variable if available, otherwise use window.location.origin
  // This ensures consistency with the server-side configuration
  return process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
};

const authClient = createAuthClient({
  baseURL: getBaseURL(),
  basePath: '/api/auth',
});

export interface User {
  userId: string;
  username: string;
  email?: string;
}

/**
 * Get user info from client-side (using Better Auth)
 * This is a React hook - must be called from a React component
 */
export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Use Better Auth's built-in getSession() - it handles the endpoint automatically
        // Add timeout to prevent hanging
        const s = await Promise.race([
          authClient.getSession(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout')), 3000)
          )
        ]);
        
        // Better Auth returns { data: { session, user }, error: null }
        const sessionData = (s && typeof s === 'object' && 'data' in s) 
          ? (s as any).data 
          : (s as any);
        setSession(sessionData);
        setIsLoading(false);
      } catch (error) {
        console.error('[Better Auth Client] Session error:', error);
        setSession(null);
        setIsLoading(false);
      }
    };

    checkSession();

    // Check session once after a short delay (in case callback just completed)
    const timeout = setTimeout(checkSession, 1000);

    // Also check when page becomes visible (user comes back from Cognito)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    user: session?.user ? {
      userId: session.user.id || '',
      username: session.user.name || session.user.email || '',
      email: session.user.email,
    } as User : null,
    isLoading,
    isAuthenticated: !!session?.user,
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
      return {
        userId: sessionData.user.id || '',
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
 * This is the only authentication method available (Cognito only)
 * 
 * Note: The callbackURL parameter in Better Auth's signIn.social() is where the user
 * should be redirected AFTER authentication completes. Better Auth automatically constructs
 * the OAuth redirect_uri as ${baseURL}/api/auth/callback/cognito, which must match
 * the callback URLs configured in Cognito.
 */
export async function login(redirectUri?: string) {
  // Store the intended post-auth redirect path if provided
  if (redirectUri && typeof window !== "undefined") {
    try {
      const url = new URL(redirectUri);
      const redirectPath = url.pathname + url.search + url.hash;
      if (redirectPath && redirectPath !== "/") {
        sessionStorage.setItem("authRedirect", redirectPath);
      }
    } catch (e) {
      // If redirectUri is not a full URL, treat it as a path
      if (redirectUri.startsWith("/")) {
        sessionStorage.setItem("authRedirect", redirectUri);
      }
    }
  }
  
  // Better Auth should construct the OAuth redirect_uri as ${baseURL}/api/auth/callback/cognito
  // However, to ensure it matches Cognito configuration exactly, we pass the full callback URL
  // The callbackURL must match exactly what's configured in Cognito User Pool Client
  const baseURL = getBaseURL();
  const oauthCallbackURL = `${baseURL}/api/auth/callback/cognito`;
  
  // Pass the exact OAuth callback URL that matches Cognito configuration
  // This ensures the redirect_uri parameter in the OAuth request matches Cognito
  // After authentication, Better Auth will redirect to the origin, and our useEffect
  // will handle redirecting to the stored path from sessionStorage
  await authClient.signIn.social({
    provider: "cognito",
    callbackURL: oauthCallbackURL,
  });
}

/**
 * Logout
 */
export async function logout() {
  try {
    await authClient.signOut();
    // Redirect to home page after logout
    window.location.href = window.location.origin;
  } catch (error) {
    console.error('[Better Auth Client] Logout error:', error);
    // Still redirect on error
    window.location.href = window.location.origin;
  }
}
