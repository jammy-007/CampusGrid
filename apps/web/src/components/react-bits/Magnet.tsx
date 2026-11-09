'use client';

import { type HTMLAttributes, type MouseEvent, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface MagnetProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  magnetStrength?: number;
  disabled?: boolean;
}

export function Magnet({
  children,
  className = '',
  magnetStrength = 2.4,
  disabled = false,
  ...props
}: MagnetProps) {
  const magnetRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = magnetRef.current;
    const inner = innerRef.current;
    if (!el || !inner || disabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = (e.clientX - centerX) / magnetStrength;
    const distY = (e.clientY - centerY) / magnetStrength;
    inner.style.transition = 'transform 180ms cubic-bezier(0.215, 0.61, 0.355, 1)';
    inner.style.transform = `translate3d(${distX.toFixed(2)}px, ${distY.toFixed(2)}px, 0)`;
  };

  const handleMouseLeave = () => {
    const inner = innerRef.current;
    if (!inner || disabled) return;
    inner.style.transition = 'transform 450ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    inner.style.transform = 'translate3d(0px, 0px, 0)';
  };

  return (
    <div
      ref={magnetRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('inline-block', className)}
      {...props}
    >
      <div ref={innerRef} className="will-change-transform">
        {children}
      </div>
    </div>
  );
}
