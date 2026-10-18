"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    // Close on unmount / when the route is hidden (Next keeps previous routes in a hidden
    // <Activity>): an open modal left in the top layer would make the new page inert.
    return () => {
      if (d.open) d.close();
    };
  }, [open]);
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <dialog
      ref={ref}
      // Esc is handled via onCancel; the native "close" event is not wired to onClose because
      // programmatic closes (cleanup, Strict Mode re-runs) must not unmount the parent's dialog.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-2xl border border-navy-100 bg-white p-0 text-navy-900 shadow-lift", widths[size])}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-navy-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-navy-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-navy-500 hover:bg-navy-50" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-navy-100 bg-navy-50/40 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
