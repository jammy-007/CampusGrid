'use client';

import { type HTMLAttributes, type MouseEvent, type ReactNode, useEffect, useRef } from 'react';
import gsap from 'gsap';
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
  const xToRef = useRef<gsap.QuickToFunc | null>(null);
  const yToRef = useRef<gsap.QuickToFunc | null>(null);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || disabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    xToRef.current = gsap.quickTo(inner, 'x', { duration: 0.45, ease: 'power3.out' });
    yToRef.current = gsap.quickTo(inner, 'y', { duration: 0.45, ease: 'power3.out' });

    return () => {
      gsap.killTweensOf(inner);
    };
  }, [disabled]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = magnetRef.current;
    if (!el || disabled || !xToRef.current || !yToRef.current) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distX = (e.clientX - centerX) / magnetStrength;
    const distY = (e.clientY - centerY) / magnetStrength;
    xToRef.current(distX);
    yToRef.current(distY);
  };

  const handleMouseLeave = () => {
    const inner = innerRef.current;
    if (!inner || disabled) return;
    gsap.to(inner, {
      x: 0,
      y: 0,
      duration: 0.65,
      ease: 'elastic.out(1, 0.4)',
    });
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
