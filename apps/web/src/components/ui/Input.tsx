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

export function Select({ label, error, hint, className, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <select id={inputId} className={cn(fieldClass, error && 'ring-red-400', className)} {...props}>
        {children}
      </select>
    </Field>
  );
}
