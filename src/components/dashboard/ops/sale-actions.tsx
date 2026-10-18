"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, FileX2, RotateCcw, Store, Undo2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";

type RefundMethod = "cash" | "upi" | "bank_transfer" | "card" | "cheque";
const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card reversal" },
  { value: "cheque", label: "Cheque" },
];

export interface ReturnableLine {
  id: string;
  description: string;
  sku: string | null;
  unit: string;
  sold: string;
  returned: string;
  unitDecimals: number;
  netPerUnit: string;
}

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, success: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(success);
      after?.();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function SaleActions({
  saleId,
  saleNumber,
  status,
  canOpenPos,
  canCancel,
  canReopen,
  canReturn,
  bill,
  netPaid,
  lines,
}: {
  saleId: string;
  saleNumber: string;
  status: string;
  canOpenPos: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canReturn: boolean;
  bill: { id: string; number: string; canCancel: boolean } | null;
  netPaid: string;
  lines: ReturnableLine[];
}) {
  const [dialog, setDialog] = useState<null | "cancel" | "reopen" | "return" | "cancelBill">(null);
  const close = () => setDialog(null);
  return (
    <div className="no-print flex flex-wrap gap-2">
      {canOpenPos && (status === "draft" || status === "finalized") && (
        <LinkButton href={`/pos/sale/${saleId}`} variant="gold" icon={<Store className="h-4 w-4" />}>
          Open in POS
        </LinkButton>
      )}
      {canReopen && (
        <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setDialog("reopen")}>
          Reopen
        </Button>
      )}
      {canReturn && (
        <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={() => setDialog("return")}>
          Process return
        </Button>
      )}
      {bill?.canCancel && (
        <Button variant="outline" className="text-red-700" icon={<FileX2 className="h-4 w-4" />} onClick={() => setDialog("cancelBill")}>
          Cancel bill
        </Button>
      )}
      {canCancel && (
        <Button variant="outline" className="text-red-700" icon={<Ban className="h-4 w-4" />} onClick={() => setDialog("cancel")}>
          Cancel sale
        </Button>
      )}
      {dialog === "cancel" && <ReasonDialog title={`Cancel sale ${saleNumber}?`} description="The sale is kept for the record and marked cancelled. Any open payment QR is closed." confirmLabel="Cancel sale" danger path={`/api/sales/${saleId}/cancel`} success="Sale cancelled" onClose={close} />}
      {dialog === "reopen" && <ReasonDialog title={`Reopen ${saleNumber} for changes?`} description="Only unpaid, unbilled sales can be reopened. The agreed amount will be recalculated with current prices when it is finalised again." confirmLabel="Reopen" path={`/api/sales/${saleId}/reopen`} success="Sale reopened" onClose={close} />}
      {dialog === "return" && <ReturnDialog saleId={saleId} lines={lines} netPaid={netPaid} onClose={close} />}
      {dialog === "cancelBill" && bill && <CancelBillDialog billId={bill.id} billNumber={bill.number} netPaid={netPaid} onClose={close} />}
    </div>
  );
}

function ReasonDialog({ title, description, confirmLabel, danger, path, success, onClose }: { title: string; description: string; confirmLabel: string; danger?: boolean; path: string; success: string; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep as is
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} disabled={reason.trim().length < 3} onClick={() => run(() => apiFetch(path, { method: "POST", body: { reason } }), success, onClose)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <Field label="Reason" htmlFor="reason" required hint="Recorded in the audit trail.">
        <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
      </Field>
    </Dialog>
  );
}

function RefundFields({ method, setMethod, reference, setReference }: { method: RefundMethod; setMethod: (m: RefundMethod) => void; reference: string; setReference: (s: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Refund method" htmlFor="rm">
        <Select id="rm" value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)}>
          {REFUND_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Refund reference" htmlFor="rr" required={method !== "cash"} hint={method === "cash" ? "Optional for cash" : "UTR / transaction no. of the refund"}>
        <Input id="rr" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
      </Field>
    </div>
  );
}

function CancelBillDialog({ billId, billNumber, netPaid, onClose }: { billId: string; billNumber: string; netPaid: string; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [reference, setReference] = useState("");
  const paid = D(netPaid).greaterThan(0);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Cancel bill ${billNumber}?`}
      description="Use only when the bill was issued in error or the goods were not supplied. The bill keeps its number and is marked CANCELLED — it is never deleted. For returned goods use “Process return” instead."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep bill
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 5 || (paid && method !== "cash" && !reference.trim())}
            onClick={() =>
              run(
                () => apiFetch(`/api/documents/${billId}/cancel`, { method: "POST", body: { reason, refund: paid ? { method, reference: reference || null } : null } }),
                "Bill cancelled",
                onClose,
              )
            }
          >
            Cancel bill
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Reason" htmlFor="cr" required hint="At least 5 characters. Printed on the cancelled bill and kept in the audit log.">
          <Textarea id="cr" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
        </Field>
        {paid && (
          <>
            <Alert tone="warning">{formatINR(netPaid)} was received for this sale and will be recorded as refunded to the customer.</Alert>
            <RefundFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} />
          </>
        )}
      </div>
    </Dialog>
  );
}

function ReturnDialog({ saleId, lines, netPaid, onClose }: { saleId: string; lines: ReturnableLine[]; netPaid: string; onClose: () => void }) {
  const { busy, error, setError, run } = useAction();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(D(netPaid).greaterThan(0));
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const selected = lines.filter((l) => qty[l.id] && D(qty[l.id] || 0).greaterThan(0));
  const estimate = selected.reduce((a, l) => a.plus(D(l.netPerUnit).times(D(qty[l.id]))), D(0));

  const submit = () => {
    for (const l of selected) {
      const remaining = D(l.sold).minus(D(l.returned));
      if (D(qty[l.id]).greaterThan(remaining)) return setError(`${l.sku ?? l.description}: at most ${formatQty(remaining.toString())} can be returned`);
    }
    run(
      () =>
        apiFetch(`/api/sales/${saleId}/returns`, {
          method: "POST",
          body: {
            lines: selected.map((l) => ({ saleLineId: l.id, quantity: D(qty[l.id]).toString() })),
            reason,
            refund: refund ? { method, reference: reference || null, amount: amount || null } : null,
          },
        }),
      "Credit note issued",
      onClose,
    );
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title="Process a return"
      description="Issues a credit note against the original bill. Amounts are calculated exactly from the original bill (including its discounts and tax)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={busy} disabled={!selected.length || reason.trim().length < 3 || (refund && method !== "cash" && !reference.trim())} onClick={submit}>
            Issue credit note
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="overflow-x-auto rounded-xl border border-navy-100">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2 text-right">Returned</th>
                <th className="px-3 py-2 text-right">Return now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const remaining = D(l.sold).minus(D(l.returned));
                return (
                  <tr key={l.id} className="border-t border-navy-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.description}</div>
                      <div className="text-xs text-navy-500">{l.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {formatQty(l.sold)} {l.unit}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{formatQty(l.returned)}</td>
                    <td className="px-3 py-2">
                      <div className="ml-auto w-24">
                        <Input
                          aria-label={`Quantity to return for ${l.description}`}
                          inputMode="decimal"
                          className="h-9 text-right"
                          placeholder="0"
                          disabled={remaining.lessThanOrEqualTo(0)}
                          value={qty[l.id] ?? ""}
                          onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selected.length > 0 && <p className="text-sm text-navy-600">Approximate credit: <strong>{formatINR(estimate.toFixed(2))}</strong> (final amount is calculated by the server).</p>}
        <Field label="Reason for return" htmlFor="rr2" required>
          <Textarea id="rr2" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} className="h-4 w-4 accent-navy-900" />
          Refund money to the customer now
        </label>
        {refund && (
          <>
            <RefundFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} />
            <Field label="Refund amount (optional)" htmlFor="ra" hint="Leave blank to refund what the customer paid towards these goods (unpaid balances are reduced instead).">
              <Input id="ra" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Auto" />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function ReversePaymentButton({ paymentId, amount }: { paymentId: string; amount: string }) {
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useAction();
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setOpen(true)}>
        Reverse
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Reverse ${formatINR(amount)} payment?`}
          description="Use only if the payment was confirmed by mistake and the money was NOT actually received. The record is kept and marked reversed."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Keep payment
              </Button>
              <Button variant="danger" loading={busy} disabled={reason.trim().length < 5} onClick={() => run(() => apiFetch(`/api/payments/${paymentId}/reverse`, { method: "POST", body: { reason } }), "Payment reversed", () => setOpen(false))}>
                Reverse payment
              </Button>
            </>
          }
        >
          {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
          <Field label="Reason" htmlFor="rev" required hint="At least 5 characters.">
            <Textarea id="rev" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
          </Field>
        </Dialog>
      )}
    </>
  );
}
