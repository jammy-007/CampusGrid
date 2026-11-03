'use client';

import { type HTMLAttributes, type MouseEvent, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  spotlightColor?: string;
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(56, 189, 248, 0.16)',
  onMouseMove,
  ...props
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = divRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      el.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      el.style.setProperty('--spotlight-color', spotlightColor);
    }
    onMouseMove?.(e);
  };

  return (
    <div
      ref={divRef}
      data-spotlight-card="true"
      onMouseMove={handleMouseMove}
      className={cn(
        'rb-spotlight-card group relative overflow-hidden rounded-2xl border border-white/12 bg-slate-950/75 p-5 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 hover:border-sky-400/30',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(520px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--spotlight-color, rgba(56, 189, 248, 0.16)), transparent 45%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
