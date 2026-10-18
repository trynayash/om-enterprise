import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-lg border border-navy-200 bg-white px-3 text-sm text-navy-900 placeholder:text-navy-300 shadow-xs transition-colors focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200 disabled:bg-navy-50 disabled:text-navy-500 aria-[invalid=true]:border-red-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-20 py-2", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export function Label({ htmlFor, children, required, className }: { htmlFor?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700", className)}>
      {children}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : hint ? <p className="mt-1 text-xs text-navy-500">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-start gap-2 text-sm text-navy-800", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-navy-300 accent-navy-900" {...rest} />
      <span>{label}</span>
    </label>
  );
}
