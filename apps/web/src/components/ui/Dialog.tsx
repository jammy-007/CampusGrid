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
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-slate-950/95 p-0 text-slate-100 shadow-2xl backdrop-blur-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-xs"
    >
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <div>{children}</div>
        {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>}
      </div>
    </dialog>
  );
}
