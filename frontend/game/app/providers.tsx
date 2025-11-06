'use client';

// Better Auth doesn't require a provider - hooks work directly with createAuthClient
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

