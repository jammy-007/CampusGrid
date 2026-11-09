'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return <>{children}</>;
}
