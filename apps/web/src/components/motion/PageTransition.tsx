'use client';

import { useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function PageTransition({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const root = containerRef.current;
      if (!root) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (reduce) return;

      gsap.fromTo(
        root,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', clearProps: 'transform' },
      );

      const cards = root.querySelectorAll<HTMLElement>('[data-spotlight-card]');
      if (cards.length > 0) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 20, scale: 0.985 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.55,
            stagger: 0.06,
            ease: 'power3.out',
            clearProps: 'transform,opacity',
          },
        );
      }
    },
    { scope: containerRef, dependencies: [pathname] },
  );

  return (
    <div ref={containerRef} className="will-change-[opacity,transform]">
      {children}
    </div>
  );
}
