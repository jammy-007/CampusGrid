import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { SpotlightCard, type SpotlightCardProps } from '@/components/react-bits/SpotlightCard';

export function Card({ className, ...props }: SpotlightCardProps) {
  return <SpotlightCard className={className} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold tracking-tight text-white', className)} {...props} />;
}
