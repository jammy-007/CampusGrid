import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 via-brand-500 to-sky-500 text-white shadow-lg shadow-brand-600/30 ring-1 ring-white/15 hover:brightness-110 disabled:opacity-50',
  secondary:
    'bg-slate-900/75 text-slate-100 ring-1 ring-white/20 backdrop-blur-md hover:bg-slate-800/90 hover:ring-sky-400/40',
  ghost: 'text-slate-200 hover:bg-white/10 hover:text-white',
  danger: 'bg-red-500/90 text-white shadow-lg shadow-red-600/25 ring-1 ring-red-400/30 hover:bg-red-500 disabled:opacity-50',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs font-medium tracking-wide',
  md: 'h-10 px-4 text-sm font-medium',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 active:scale-[0.98] disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant, size, loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
