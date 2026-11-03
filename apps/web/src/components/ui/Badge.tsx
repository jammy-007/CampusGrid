import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-800/80 text-slate-200 ring-1 ring-white/15',
  brand: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/35',
  green: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/35',
  amber: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/35',
  red: 'bg-red-500/15 text-red-300 ring-1 ring-red-400/35',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide backdrop-blur-sm',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
