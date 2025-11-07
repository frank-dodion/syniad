'use client';

import React from 'react';

// Better Auth doesn't require a provider wrapper - hooks work directly
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
