'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function PageTransition({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduce || typeof root.animate !== 'function') return;

    const rootAnim = root.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0px)' },
      ],
      { duration: 450, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', fill: 'both' },
    );
    rootAnim.onfinish = () => {
      rootAnim.cancel();
    };

    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-spotlight-card]'));
    const cardAnims = cards.map((card, index) => {
      const anim = card.animate(
        [
          { opacity: 0, transform: 'translateY(20px) scale(0.985)' },
          { opacity: 1, transform: 'translateY(0px) scale(1)' },
        ],
        {
          duration: 550,
          delay: index * 60,
          easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
          fill: 'both',
        },
      );
      anim.onfinish = () => {
        anim.cancel();
      };
      return anim;
    });

    return () => {
      rootAnim.cancel();
      cardAnims.forEach((a) => a.cancel());
    };
  }, [pathname]);

  return (
    <div ref={containerRef} className="will-change-[opacity,transform]">
      {children}
    </div>
  );
}
