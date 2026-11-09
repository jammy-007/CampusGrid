'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  animateBy?: 'words' | 'letters';
}

export function BlurText({
  text,
  className = '',
  delay = 0,
  stagger = 0.06,
  animateBy = 'words',
}: BlurTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const parts = animateBy === 'words' ? text.split(' ') : text.split('');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-blur-item]'));
    if (reduce) return;

    const anims = items.map((item, idx) => {
      if (typeof item.animate !== 'function') return null;
      const anim = item.animate(
        [
          { opacity: 0, filter: 'blur(10px)', transform: 'translateY(16px)' },
          { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px)' },
        ],
        {
          duration: 700,
          delay: (delay + idx * stagger) * 1000,
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
      anims.forEach((a) => a?.cancel());
    };
  }, [text, delay, stagger, animateBy]);

  return (
    <span ref={containerRef} className={cn('inline-flex flex-wrap justify-center gap-x-[0.28em]', className)}>
      {parts.map((part, idx) => (
        <span key={`${part}-${idx}`} data-blur-item className="inline-block will-change-[transform,filter,opacity]">
          {part === ' ' ? '\u00A0' : part}
        </span>
      ))}
    </span>
  );
}
