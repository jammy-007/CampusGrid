import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface ShinyTextProps extends HTMLAttributes<HTMLSpanElement> {
  text: string;
  disabled?: boolean;
  speed?: number;
}

export function ShinyText({
  text,
  disabled = false,
  speed = 4,
  className = '',
  style,
  ...props
}: ShinyTextProps) {
  return (
    <span
      className={cn('rb-shiny-text inline-block', disabled && 'rb-shiny-disabled', className)}
      style={{
        animationDuration: `${speed}s`,
        ...style,
      }}
      {...props}
    >
      {text}
    </span>
  );
}
