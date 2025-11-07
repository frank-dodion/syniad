'use client';

import { createAuthClient } from "better-auth/react";
import { useState, useEffect } from "react";

const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
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
    authClient.getSession().then((s) => {
      setSession(s);
      setIsLoading(false);
    }).catch(() => {
      setSession(null);
      setIsLoading(false);
    });
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
  const session = await authClient.getSession();
  if (session?.user) {
    return {
      userId: session.user.id || '',
      username: session.user.name || session.user.email || '',
      email: session.user.email,
    };
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
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = window.location.origin;
      },
    },
  });
}
