'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Modal built on the native <dialog> element (focus trap and Esc handled by the browser). */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div>{children}</div>
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
