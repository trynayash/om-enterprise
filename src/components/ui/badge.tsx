import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "navy" | "gold" | "green" | "red" | "amber" | "blue" | "purple";
// Four colours only: grey for information, green for done, amber for waiting or needs a look, red for
// stopped or failed. The older tone names stay accepted and map onto these.
const NEUTRAL = "bg-navy-50 text-navy-700 ring-navy-100";
const AMBER = "bg-amber-50 text-amber-800 ring-amber-200/70";
const tones: Record<Tone, string> = {
  neutral: NEUTRAL,
  navy: NEUTRAL,
  gold: AMBER,
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  red: "bg-red-50 text-red-800 ring-red-200/70",
  amber: AMBER,
  blue: NEUTRAL,
  purple: NEUTRAL,
};

/** A small status label with a dot. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1.5 py-[3px] text-[11.5px] font-medium leading-none ring-1 ring-inset", tones[tone], className)}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

/** Shown on every demonstration product, price and training transaction. */
export function SampleBadge({ className, label = "Sample data" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-[3px] bg-red-50 px-1.5 py-[3px] text-xs font-medium leading-none text-red-800 ring-1 ring-inset ring-red-200", className)} title="Demonstration data — not a real product, price or transaction">
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
  partially_refunded: ["Part refunded", "neutral"],
  refunded: ["Refunded", "neutral"],
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
  new: ["New", "amber"],
  contacted: ["Contacted", "neutral"],
  quoted: ["Quoted", "neutral"],
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
