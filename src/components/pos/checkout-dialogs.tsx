"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import type { SaleData } from "./types";
import { optionLabel } from "@/lib/line-description";

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;

/** Final confirmation of the agreed amount. After this the price snapshot is frozen. */
export function FinalizeDialog({ data, onClose, run }: { data: SaleData; onClose: () => void; run: Run }) {
  const s = data.sale;
  const items = data.lines.filter((l) => l.lineType === "item");
  const discount = D(s.lineDiscountTotal).plus(D(s.cartDiscountTotal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/sales/${s.id}/finalize`, { method: "POST", body: {} });
      await run(async () => {}, "Amount agreed — take payment");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title="Confirm the final amount"
      description="Show the customer the total. Once agreed, prices are locked for this sale."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back to cart
          </Button>
          <Button variant="gold" size="lg" loading={busy} onClick={confirm} icon={<CheckCircle2 className="h-5 w-5" />}>
            Customer agrees — {formatINR(s.grandTotal)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="rounded-lg bg-navy-950 px-5 py-6 text-center text-white">
          <div className="label-sm text-gold-400">Amount payable</div>
          <div className="headline mt-2 text-[2.25rem] font-bold tabular sm:text-[2.75rem]">{formatINR(s.grandTotal)}</div>
          {discount.greaterThan(0) && (
            <div className="mt-2 text-sm text-navy-300">
              Includes <span className="tabular">{formatINR(discount)}</span> discount
            </div>
          )}
        </div>
        <ul className="max-h-56 divide-y divide-navy-100 overflow-y-auto rounded-lg border border-navy-200 text-sm">
          {items.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="font-medium text-navy-950">{l.productName}</span>
                {optionLabel(l.variantName) && <span className="text-navy-500"> · {l.variantName}</span>}
                <span className="mt-0.5 block tabular text-xs text-navy-500">
                  {formatQty(l.quantity)} × {formatINR(l.unitPrice)}
                </span>
              </span>
              <span className="shrink-0 tabular font-semibold text-navy-950">{formatINR(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="text-center text-base font-semibold text-navy-950">Does the customer agree to pay {formatINR(s.grandTotal)}?</p>
      </div>
    </Dialog>
  );
}

/** Saves a quotation document (prices held for the validity period) and opens it. */
export function QuotationDialog({ data, onClose }: { data: SaleData; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(data.customer?.name ?? "");
  const [mobile, setMobile] = useState(data.customer?.mobile ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const customer = name.trim()
        ? { id: data.customer?.id ?? null, name: name.trim(), mobile: mobile.trim() || null, stateCode: data.customer?.stateCode ?? null }
        : undefined;
      const doc = await apiFetch<{ id: string }>(`/api/sales/${data.sale.id}/quotation`, { method: "POST", body: { customer } });
      onClose(); // close the modal before navigating (previous routes stay mounted but hidden)
      router.push(`/pos/documents/${doc.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Save as quotation"
      description="Creates a numbered quotation with these prices held for the validity period. You can still bill this sale later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Create quotation
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Customer name (optional)" htmlFor="q-name">
          <Input id="q-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        </Field>
        <Field label="Mobile (optional)" htmlFor="q-mobile" hint="10-digit Indian mobile number">
          <Input id="q-mobile" className="tabular" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} maxLength={16} />
        </Field>
      </div>
    </Dialog>
  );
}
