'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
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

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const items = el.querySelectorAll<HTMLElement>('[data-blur-item]');
      if (reduce) {
        gsap.set(items, { opacity: 1, filter: 'blur(0px)', y: 0 });
        return;
      }
      gsap.fromTo(
        items,
        {
          opacity: 0,
          filter: 'blur(10px)',
          y: 16,
        },
        {
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          duration: 0.7,
          delay,
          stagger,
          ease: 'power3.out',
          clearProps: 'filter',
        },
      );
    },
    { scope: containerRef, dependencies: [text, delay, stagger, animateBy] },
  );

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
