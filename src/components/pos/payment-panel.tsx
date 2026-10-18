"use client";
import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Landmark, QrCode, Receipt, RotateCcw, Smartphone, XCircle } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR } from "@/lib/money";
import { isValidUpiUtr } from "@/lib/india";
import { Button, Spinner } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { DateTime } from "@/components/ui/money";
import { cn } from "@/components/ui/cn";
import { ReasonDialog } from "./reason-dialog";
import { hasPerm, type Me, type PaymentJson, type PosConfig, type SaleData } from "./types";

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Method = "upi" | "cash" | "card" | "bank_transfer" | "cheque";

const METHOD_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", other: "Other" };
const METHOD_ICON: Record<string, React.ReactNode> = {
  upi: <Smartphone className="h-4 w-4" />,
  cash: <Banknote className="h-4 w-4" />,
  card: <CreditCard className="h-4 w-4" />,
  bank_transfer: <Landmark className="h-4 w-4" />,
  cheque: <Receipt className="h-4 w-4" />,
};
const VERIFY_LABEL: Record<string, string> = {
  manual_merchant_app: "checked in merchant app",
  manual_bank_statement: "checked in bank statement",
  cash_counted: "cash counted",
  gateway_webhook: "confirmed by gateway",
  gateway_api: "confirmed by gateway",
  manual_other: "checked manually",
};

export function outstandingOf(data: SaleData) {
  return D(data.sale.grandTotal).minus(D(data.sale.amountPaid)).plus(D(data.sale.amountRefunded));
}

function qrUrlOf(p: PaymentJson): string | null {
  if (p.qrPayload) return `/api/payments/${p.id}/qr`;
  return (p.providerData as { qrImageUrl?: string } | null)?.qrImageUrl ?? null;
}

export function PaymentPanel({ data, config, me, run }: { data: SaleData; config: PosConfig; me: Me; run: Run }) {
  const s = data.sale;
  const outstanding = outstandingOf(data);
  const upiAvailable = config.payments.upiEnabled || config.payments.gatewayProvider !== "none";
  const openQrs = data.payments
    .filter((p) => p.direction === "in" && p.method === "upi" && (p.status === "initiated" || p.status === "pending"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeQr = openQrs[0] ?? null;
  const [verifyFor, setVerifyFor] = useState<PaymentJson | null>(null);
  const [manualOpen, setManualOpen] = useState(!upiAvailable);
  const canRecord = hasPerm(me, "payments.record");
  const canVerify = hasPerm(me, "payments.verify");

  return (
    <section aria-label="Payment" className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
      <div className="flex items-end justify-between gap-3 border-b border-navy-100 px-5 py-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-gold-600">Step 2 · Take payment</div>
          <div className="mt-0.5 text-sm text-navy-500">
            {D(s.amountPaid).greaterThan(0) ? `Received ${formatINR(s.amountPaid)} of ${formatINR(s.grandTotal)}` : `Agreed total ${formatINR(s.grandTotal)}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase tracking-wide text-navy-500">Amount due</div>
          <div className="text-3xl font-extrabold text-navy-900 tabular" data-testid="amount-due">
            {formatINR(outstanding)}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {activeQr ? (
          <QrCard payment={activeQr} config={config} saleNumber={s.saleNumber} canVerify={canVerify} run={run} onVerify={() => setVerifyFor(activeQr)} />
        ) : upiAvailable && canRecord ? (
          <StartQr saleId={s.id} outstanding={outstanding.toFixed(2)} max={config.payments.maxPerUpiPayment} run={run} />
        ) : !upiAvailable ? (
          <Alert tone="info" title="UPI QR is not set up">
            Ask the Super Admin to add the shop&apos;s UPI ID in Settings → Payments. Record cash or other payments below.
          </Alert>
        ) : null}

        {verifyFor && canVerify && (
          <VerifyForm
            key={verifyFor.id}
            saleId={s.id}
            config={config}
            outstanding={outstanding.toFixed(2)}
            intent={verifyFor}
            onDone={() => setVerifyFor(null)}
            run={run}
          />
        )}

        {canVerify && !verifyFor && (
          <div className="rounded-xl border border-navy-100">
            <button
              type="button"
              onClick={() => setManualOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-navy-800 hover:bg-navy-50/60"
              aria-expanded={manualOpen}
            >
              <span>Record cash, card, bank transfer or UPI received without the QR</span>
              <span className="text-navy-400">{manualOpen ? "−" : "+"}</span>
            </button>
            {manualOpen && (
              <div className="border-t border-navy-100 p-4">
                <VerifyForm saleId={s.id} config={config} outstanding={outstanding.toFixed(2)} intent={null} onDone={() => setManualOpen(false)} run={run} />
              </div>
            )}
          </div>
        )}

        <PaymentList payments={data.payments} />
      </div>
    </section>
  );
}

function StartQr({ saleId, outstanding, max, run }: { saleId: string; outstanding: string; max: string; run: Run }) {
  const capped = D(outstanding).greaterThan(D(max));
  const [amount, setAmount] = useState(capped ? D(max).toFixed(2) : D(outstanding).toFixed(2));
  const [busy, setBusy] = useState(false);
  const valid = /^\d{1,10}(\.\d{1,2})?$/.test(amount) && D(amount).greaterThan(0) && D(amount).lessThanOrEqualTo(D(outstanding));
  return (
    <div className="rounded-2xl border border-gold-200 bg-gold-50/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="UPI amount (₹)" htmlFor="qr-amount" className="w-40" hint={D(amount).lessThan(D(outstanding)) ? "Part payment" : "Full amount due"}>
          <Input id="qr-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 text-lg font-bold tabular" />
        </Field>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          loading={busy}
          disabled={!valid}
          icon={<QrCode className="h-5 w-5" />}
          onClick={async () => {
            setBusy(true);
            await run(() => apiFetch(`/api/sales/${saleId}/payments/upi`, { method: "POST", body: { amount } }), "QR ready — ask the customer to scan");
            setBusy(false);
          }}
        >
          Show UPI QR for {valid ? formatINR(amount) : "…"}
        </Button>
      </div>
      {capped && <p className="mt-2 text-xs text-amber-800">UPI payments are limited to {formatINR(max)} each. Collect the rest with another QR or method.</p>}
    </div>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function QrCard({
  payment,
  config,
  saleNumber,
  canVerify,
  run,
  onVerify,
}: {
  payment: PaymentJson;
  config: PosConfig;
  saleNumber: string;
  canVerify: boolean;
  run: Run;
  onVerify: () => void;
}) {
  const now = useNow(1000);
  const [closing, setClosing] = useState<null | "failed" | "cancelled" | "expired">(null);
  const pd = (payment.providerData ?? {}) as { autoVerify?: boolean; instructions?: string };
  const auto = !!pd.autoVerify;
  const expiresAt = payment.expiresAt ? new Date(payment.expiresAt).getTime() : null;
  const left = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const expired = left === 0;
  const qrUrl = qrUrlOf(payment);

  // Gateway QR: poll until the signed webhook confirms the payment.
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(async () => {
      try {
        const res = await apiFetch<{ payment: PaymentJson }>(`/api/payments/${payment.id}`);
        if (res.payment.status !== "initiated" && res.payment.status !== "pending") {
          await run(async () => {}, res.payment.status === "successful" ? "Payment confirmed by the gateway" : undefined);
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => clearInterval(t);
  }, [auto, payment.id, run]);

  return (
    <div className="rounded-2xl border-2 border-navy-900 p-4">
      <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-start md:text-left">
        <div className={cn("relative w-60 shrink-0 rounded-2xl bg-white p-2 shadow-card ring-1 ring-navy-100", expired && "opacity-40")}>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt={`UPI QR code for ${formatINR(payment.amount)}`} className="aspect-square w-full bg-navy-50" data-testid="upi-qr" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-sm text-navy-500">QR unavailable</div>
          )}
          {expired && <div className="absolute inset-0 flex items-center justify-center text-lg font-extrabold text-red-700">QR EXPIRED</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-gold-600">Scan to pay</div>
          <div className="text-4xl font-extrabold text-navy-900 tabular sm:text-5xl" data-testid="qr-amount">
            {formatINR(payment.amount)}
          </div>
          <div className="mt-1 text-sm text-navy-600">
            {payment.provider === "upi_static" ? (
              <>
                To <b>{config.businessName}</b> · <span className="font-mono">{config.payments.upiVpa}</span>
              </>
            ) : (
              <>Razorpay dynamic QR · single use</>
            )}
          </div>
          <div className="text-xs text-navy-500">Payment note: {saleNumber}</div>
          {left !== null && !expired && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 tabular">
              Valid for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </div>
          )}
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
            <b>Not paid yet.</b> {pd.instructions ?? "Check the shop's UPI app for the exact amount before confirming."}
          </div>
          {auto && (
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-navy-700">
              <Spinner /> Waiting for the gateway to confirm…
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {canVerify && (
          <Button variant="success" size="lg" icon={<CheckCircle2 className="h-5 w-5" />} onClick={onVerify}>
            {auto ? "Confirm manually" : "Payment received — verify"}
          </Button>
        )}
        <Button variant="outline" icon={<XCircle className="h-4 w-4" />} onClick={() => setClosing("failed")}>
          Customer couldn&apos;t pay
        </Button>
        <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setClosing(expired ? "expired" : "cancelled")}>
          {expired ? "Mark expired / new QR" : "Cancel QR"}
        </Button>
      </div>
      {closing && (
        <ReasonDialog
          open
          onClose={() => setClosing(null)}
          title={closing === "failed" ? "Payment failed" : closing === "expired" ? "Mark QR expired" : "Cancel this QR"}
          description="Only do this if no money was received for this QR. You can generate a new one afterwards."
          confirmLabel="Confirm"
          confirmVariant="danger"
          onConfirm={async (reason) => {
            await apiFetch(`/api/payments/${payment.id}/status`, { method: "POST", body: { status: closing, reason } });
            await run(async () => {}, "QR closed");
          }}
        />
      )}
    </div>
  );
}

function VerifyForm({
  saleId,
  config,
  outstanding,
  intent,
  onDone,
  run,
}: {
  saleId: string;
  config: PosConfig;
  outstanding: string;
  intent: PaymentJson | null;
  onDone: () => void;
  run: Run;
}) {
  const methods = (
    [
      ["upi", config.payments.upiEnabled || config.payments.gatewayProvider !== "none"],
      ["cash", config.payments.cashEnabled],
      ["card", config.payments.cardEnabled],
      ["bank_transfer", config.payments.bankTransferEnabled],
      ["cheque", config.payments.chequeEnabled],
    ] as [Method, boolean][]
  )
    .filter(([, on]) => on)
    .map(([m]) => m);
  const [method, setMethod] = useState<Method>(intent ? "upi" : methods.includes("cash") ? "cash" : (methods[0] ?? "cash"));
  const [amount, setAmount] = useState(intent ? intent.amount : D(outstanding).toFixed(2));
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState("");
  const [via, setVia] = useState<"manual_merchant_app" | "manual_bank_statement">("manual_merchant_app");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValid = /^\d{1,10}(\.\d{1,2})?$/.test(amount) && D(amount).greaterThan(0);
  const ref = reference.trim();
  const refValid =
    method === "upi" ? (!config.payments.requireUpiReference && !ref) || isValidUpiUtr(ref) : method === "cash" ? true : ref.length >= 4;
  const change = method === "cash" && /^\d+(\.\d{1,2})?$/.test(tendered) && amountValid ? D(tendered).minus(D(amount)) : null;
  const verificationMethod =
    method === "cash" ? "cash_counted" : method === "upi" ? via : method === "card" ? "manual_other" : "manual_bank_statement";

  const confirmText: Record<Method, string> = {
    upi: `I have checked the shop's ${via === "manual_bank_statement" ? "bank statement" : "UPI / bank app"} and ${amountValid ? formatINR(amount) : "the amount"} has been credited.`,
    cash: `I have counted the cash and ${amountValid ? formatINR(amount) : "the amount"} is in the drawer.`,
    card: `The card terminal shows ${amountValid ? formatINR(amount) : "the amount"} as approved.`,
    bank_transfer: `The bank statement shows ${amountValid ? formatINR(amount) : "the amount"} credited.`,
    cheque: `The cheque has cleared and ${amountValid ? formatINR(amount) : "the amount"} is credited.`,
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/sales/${saleId}/payments/verify`, {
        method: "POST",
        body: {
          method,
          amount,
          reference: ref || null,
          tenderedAmount: method === "cash" && tendered ? tendered : null,
          verificationMethod,
          note: note.trim() || null,
          paymentId: intent?.id ?? null,
          confirmReceived: confirmed,
        },
      });
      await run(async () => {}, `${formatINR(amount)} ${METHOD_LABEL[method]} payment verified`);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-3", intent && "rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-4")}>
      {intent && <div className="text-sm font-extrabold text-emerald-900">Verify the UPI payment for {formatINR(intent.amount)}</div>}
      {error && <Alert tone="danger">{error}</Alert>}
      {!intent && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => {
                setMethod(m);
                setReference("");
                setConfirmed(false);
              }}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors",
                method === m ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50",
              )}
            >
              {METHOD_ICON[m]} {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received (₹)" htmlFor="pay-amount" hint={intent ? "Fixed — the QR was for this amount" : `Due: ${formatINR(outstanding)}`}>
          <Input
            id="pay-amount"
            inputMode="decimal"
            value={amount}
            disabled={!!intent}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ""));
              setConfirmed(false);
            }}
            className="h-12 text-lg font-bold tabular"
          />
        </Field>
        {method === "cash" ? (
          <Field label="Cash tendered (optional)" htmlFor="pay-tendered" hint={change && change.greaterThanOrEqualTo(0) ? `Return change: ${formatINR(change)}` : "To calculate change"}>
            <Input id="pay-tendered" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 text-lg tabular" />
          </Field>
        ) : (
          <Field
            label={method === "upi" ? "UTR / UPI Ref. No." : method === "card" ? "Card approval code" : method === "cheque" ? "Cheque number" : "Transfer reference (UTR)"}
            htmlFor="pay-ref"
            required={method !== "upi" || config.payments.requireUpiReference}
            error={ref && !refValid ? (method === "upi" ? "UPI references are 12 digits" : "At least 4 characters") : null}
            hint={method === "upi" ? "12 digits, shown in the shop's UPI app for this credit" : undefined}
          >
            <Input
              id="pay-ref"
              value={reference}
              inputMode={method === "upi" ? "numeric" : "text"}
              onChange={(e) => setReference(method === "upi" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value)}
              className="h-12 font-mono text-lg tracking-wider"
              autoFocus={!!intent}
              aria-invalid={!!ref && !refValid}
            />
          </Field>
        )}
      </div>
      {method === "upi" && (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="via" checked={via === "manual_merchant_app"} onChange={() => setVia("manual_merchant_app")} className="accent-navy-900" />
            Checked in UPI / merchant app
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="via" checked={via === "manual_bank_statement"} onChange={() => setVia("manual_bank_statement")} className="accent-navy-900" />
            Checked in bank statement
          </label>
        </div>
      )}
      {method === "cheque" && <Alert tone="warning">Record a cheque only after it has cleared in the bank account.</Alert>}
      <Field label="Note (optional)" htmlFor="pay-note">
        <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-12" />
      </Field>
      <div className="rounded-xl border border-navy-200 bg-white px-3 py-3">
        <Checkbox label={<span className="font-semibold">{confirmText[method]}</span>} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="confirm-received" />
        <p className="ml-6 mt-1 text-xs text-navy-500">A button click is not proof of payment — confirm only after you have seen the money. Your name is recorded.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" size="lg" loading={busy} disabled={!amountValid || !refValid || !confirmed} onClick={submit} icon={<CheckCircle2 className="h-5 w-5" />}>
          Confirm {amountValid ? formatINR(amount) : ""} received
        </Button>
        {intent && (
          <Button variant="ghost" onClick={onDone}>
            Back
          </Button>
        )}
      </div>
    </div>
  );
}

function PaymentList({ payments }: { payments: PaymentJson[] }) {
  if (!payments.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-navy-500">Payment records</div>
      <ul className="divide-y divide-navy-50 rounded-xl border border-navy-100">
        {payments
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="text-navy-500">{METHOD_ICON[p.method]}</span>
              <span className="font-semibold">
                {p.direction === "refund" ? "Refund · " : ""}
                {METHOD_LABEL[p.method]}
              </span>
              <StatusBadge status={p.status} />
              {p.reference && <span className="font-mono text-xs text-navy-500">Ref {p.reference}</span>}
              {p.verificationMethod && <span className="text-xs text-navy-500">{VERIFY_LABEL[p.verificationMethod]}</span>}
              <span className="ml-auto flex items-center gap-3">
                <span className="text-xs text-navy-400">
                  <DateTime value={p.verifiedAt ?? p.createdAt} />
                </span>
                <span className="font-bold tabular">{formatINR(p.amount)}</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
