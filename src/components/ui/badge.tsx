import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "navy" | "gold" | "green" | "red" | "amber" | "blue" | "purple";
const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  navy: "bg-navy-100 text-navy-800 ring-navy-200",
  gold: "bg-gold-100 text-gold-700 ring-gold-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

/** Shown on every demonstration product, price and training transaction. */
export function SampleBadge({ className, label = "SAMPLE DATA" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white", className)} title="Demonstration data — not a real product, price or transaction">
      {label}
    </span>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  // sale
  draft: ["Draft", "neutral"],
  finalized: ["Awaiting payment", "amber"],
  completed: ["Completed", "green"],
  cancelled: ["Cancelled", "red"],
  // payment status
  unpaid: ["Unpaid", "amber"],
  partially_paid: ["Part paid", "amber"],
  paid: ["Paid", "green"],
  partially_refunded: ["Part refunded", "purple"],
  refunded: ["Refunded", "purple"],
  // payment record
  pending: ["Pending", "neutral"],
  initiated: ["QR shown — not verified", "amber"],
  successful: ["Verified", "green"],
  failed: ["Failed", "red"],
  expired: ["Expired", "neutral"],
  reversed: ["Reversed", "red"],
  // approvals
  not_required: ["No approval needed", "neutral"],
  required: ["Approval needed", "amber"],
  approved: ["Approved", "green"],
  rejected: ["Rejected", "red"],
  superseded: ["Superseded", "neutral"],
  // documents
  issued: ["Issued", "green"],
  // website orders
  new: ["New", "gold"],
  contacted: ["Contacted", "blue"],
  quoted: ["Quoted", "blue"],
  converted: ["Converted", "green"],
  closed: ["Closed", "neutral"],
  spam: ["Spam", "red"],
  // review
  pending_review: ["Pending review", "amber"],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [label, tone] = STATUS[status] ?? [status.replace(/_/g, " "), "neutral" as Tone];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
