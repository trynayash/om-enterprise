"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { errorMessage } from "@/lib/api-client";
import { D, formatINR, r2 } from "@/lib/money";

export interface DiscountValue {
  type: "percent" | "amount";
  value: string;
}

/** Percent / fixed discount editor, used for a single line and for the whole bill. Mount only while open. */
export function DiscountDialog({
  open,
  onClose,
  title,
  baseAmount,
  current,
  currentReason,
  limitPercent,
  reasonRequired,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Amount the discount applies to (₹, before this discount). */
  baseAmount: string;
  current: DiscountValue | null;
  currentReason?: string | null;
  limitPercent: string;
  reasonRequired: boolean;
  onSave: (d: DiscountValue | null, reason: string | null) => Promise<void>;
}) {
  const [type, setType] = useState<"percent" | "amount">(current?.type ?? "percent");
  const [value, setValue] = useState(current ? D(current.value).toString() : "");
  const [reason, setReason] = useState(currentReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\d{1,10}(\.\d{1,2})?$/.test(value);
  const base = D(baseAmount);
  const amount = valid ? (type === "percent" ? r2(base.times(D(value)).div(100)) : D(value)) : D(0);
  const pct = valid && base.greaterThan(0) ? amount.div(base).times(100) : D(0);
  const overLimit = pct.greaterThan(D(limitPercent));

  const save = async (d: DiscountValue | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(d, d ? reason.trim() || null : null);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={`On ${formatINR(baseAmount)}. Your limit without approval: ${D(limitPercent).toString()}%.`}
      footer={
        <>
          {current && (
            <Button variant="ghost" className="mr-auto text-red-700" onClick={() => save(null)} disabled={busy}>
              Remove discount
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!valid || D(value).isZero() || (reasonRequired && !reason.trim())}
            onClick={() => save({ type, value })}
          >
            Apply discount
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Discount type">
          {(["percent", "amount"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold transition-colors",
                type === t ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50",
              )}
            >
              {t === "percent" ? "Percent (%)" : "Amount (₹)"}
            </button>
          ))}
        </div>
        <Field label={type === "percent" ? "Discount %" : "Discount amount (₹)"} htmlFor="disc-value">
          <Input
            id="disc-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
            className="h-12 text-lg font-bold tabular"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !D(value).isZero() && !(reasonRequired && !reason.trim())) save({ type, value });
            }}
          />
        </Field>
        {valid && !D(value).isZero() && (
          <div className="flex items-center justify-between rounded-xl bg-navy-50 px-4 py-3 text-sm">
            <span className="text-navy-600">
              Discount {formatINR(amount)} ({pct.toFixed(2)}%)
            </span>
            <span className="font-bold text-navy-900">New amount {formatINR(base.minus(amount))}</span>
          </div>
        )}
        {overLimit && (
          <Alert tone="warning">
            This is above your {D(limitPercent).toString()}% limit. You can apply it, but the sale will need approval before it can be finalised.
          </Alert>
        )}
        <Field label="Reason" htmlFor="disc-reason" required={reasonRequired} hint="e.g. regular contractor, bulk order, damaged packaging">
          <Textarea id="disc-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="min-h-16" />
        </Field>
      </div>
    </Dialog>
  );
}
