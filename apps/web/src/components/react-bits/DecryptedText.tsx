'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  characters?: string;
  className?: string;
  encryptedClassName?: string;
  animateOn?: 'view' | 'hover' | 'both';
}

export function DecryptedText({
  text,
  speed = 38,
  maxIterations = 10,
  characters = '=+xX0S8#@01',
  className = '',
  encryptedClassName = 'text-sky-400/80',
  animateOn = 'both',
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isScrambling, setIsScrambling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerDecrypt = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplayText(text);
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    let iteration = 0;
    setIsScrambling(true);

    timerRef.current = setInterval(() => {
      iteration += 1;
      const progress = iteration / maxIterations;
      const revealedCount = Math.floor(progress * text.length);

      const next = text
        .split('')
        .map((ch, idx) => {
          if (ch === ' ') return ' ';
          if (idx < revealedCount || iteration >= maxIterations) return ch;
          return characters[Math.floor(Math.random() * characters.length)] ?? ch;
        })
        .join('');

      setDisplayText(next);

      if (iteration >= maxIterations) {
        if (timerRef.current) clearInterval(timerRef.current);
        setDisplayText(text);
        setIsScrambling(false);
      }
    }, speed);
  }, [text, speed, maxIterations, characters]);

  useEffect(() => {
    setDisplayText(text);
    if (animateOn === 'view' || animateOn === 'both') {
      triggerDecrypt();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, animateOn, triggerDecrypt]);

  return (
    <span
      onMouseEnter={animateOn === 'hover' || animateOn === 'both' ? triggerDecrypt : undefined}
      className={cn('inline-block font-mono tracking-tight', isScrambling && encryptedClassName, className)}
    >
      {displayText}
    </span>
  );
}
