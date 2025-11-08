'use client';

import { createAuthClient } from "better-auth/react";
import { useState, useEffect } from "react";

const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
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
 */
export async function login(redirectUri?: string) {
  await authClient.signIn.social({
    provider: "cognito",
    callbackURL: redirectUri || window.location.origin + window.location.pathname,
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
