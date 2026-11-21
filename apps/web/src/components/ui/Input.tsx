import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const fieldClass =
  'block w-full rounded-xl border-0 bg-slate-950/75 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-white/15 backdrop-blur-md transition-all placeholder:text-slate-500 focus:bg-slate-950/90 focus:ring-2 focus:ring-sky-400 focus:outline-none disabled:bg-slate-900/50 disabled:text-slate-500';

interface FieldProps {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
}

function Field({ id, label, error, hint, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-200">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
    </div>
  );
}

export function Input({ label, error, hint, className, id, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <input id={inputId} className={cn(fieldClass, error && 'ring-red-400', className)} {...props} />
    </Field>
  );
}

export function Textarea({ label, error, hint, className, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <textarea id={inputId} className={cn(fieldClass, 'min-h-24', error && 'ring-red-400', className)} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, className, id, style, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <div className="relative">
        <select
          id={inputId}
          className={cn(
            fieldClass,
            'cg-select appearance-none pr-10 [&>option]:bg-slate-900 [&>option]:text-slate-100',
            error && 'ring-red-400',
            className,
          )}
          style={{
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            ...style,
          }}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </Field>
  );
}
