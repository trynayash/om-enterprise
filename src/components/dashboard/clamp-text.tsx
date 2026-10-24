"use client";
import { useCallback, useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Long free text (a price-change reason, a note) cut to two lines. The full text is in the tooltip,
 * and a "More" toggle appears only when the text really is cut, so it also works on touch screens.
 */
export function ClampText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const measure = useCallback((el: HTMLParagraphElement | null) => {
    if (!el) return;
    const check = () => setCut(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={className}>
      <p ref={open ? undefined : measure} title={open ? undefined : text} className={cn("break-words", !open && "line-clamp-2")}>
        {text}
      </p>
      {(cut || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-0.5 text-xs font-semibold text-navy-700 underline-offset-[3px] hover:text-navy-950 hover:underline"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
