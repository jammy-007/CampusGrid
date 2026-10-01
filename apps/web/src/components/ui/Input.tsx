import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const fieldClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-100';

interface FieldProps {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
}

function Field({ id, label, error, hint, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ label, error, hint, className, id, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <input id={inputId} className={cn(fieldClass, error && 'ring-red-500', className)} {...props} />
    </Field>
  );
}

export function Textarea({ label, error, hint, className, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <textarea id={inputId} className={cn(fieldClass, 'min-h-24', error && 'ring-red-500', className)} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, className, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint}>
      <select id={inputId} className={cn(fieldClass, error && 'ring-red-500', className)} {...props}>
        {children}
      </select>
    </Field>
  );
}
