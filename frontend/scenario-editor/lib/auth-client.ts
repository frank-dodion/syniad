/**
 * Client-side authentication utilities using Better Auth
 */

import { createAuthClient } from "better-auth/react";

const baseURL = typeof window !== 'undefined' 
  ? window.location.origin 
  : process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

export const authClient = createAuthClient({
  baseURL,
});

export const { signIn, signOut, useSession } = authClient;

export interface User {
  userId: string;
  username: string;
  email?: string;
}

/**
 * Get user info from client-side (using Better Auth session)
 */
export function useAuth() {
  const { data: session, isPending } = useSession();
  
  return {
    user: session?.user ? {
      userId: session.user.id || '',
      username: session.user.name || session.user.email || '',
      email: session.user.email,
    } as User : null,
    isLoading: isPending,
    isAuthenticated: !!session?.user,
    session,
  };
}

/**
 * Get user info from client-side
 */
export async function getUserInfo(): Promise<User | null> {
  try {
    const response = await fetch('/api/auth/get-session', {
      credentials: 'include',
      cache: 'no-store',
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        return {
          userId: data.user.id || '',
          username: data.user.name || data.user.email || '',
          email: data.user.email,
        };
      }
    }
    return null;
  } catch (e) {
    console.error('Error getting user info:', e);
    return null;
  }
}

/**
 * Check if user is authenticated (client-side)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/get-session', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.ok) {
      const data = await response.json();
      return !!data.user;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Login - redirect to Better Auth Cognito sign in
 */
export function login(redirectUri?: string) {
  signIn.social({
    provider: "cognito",
    callbackURL: redirectUri || window.location.href,
  });
}

/**
 * Logout
 */
export function logout() {
  signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = window.location.href;
      },
    },
  });
}
