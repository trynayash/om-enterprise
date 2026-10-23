"use client";
import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, ChevronDown, CreditCard, Landmark, QrCode, Receipt, RotateCcw, Smartphone, XCircle } from "lucide-react";
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
    <section aria-label="Payment" className="animate-rise overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-navy-200 px-5 py-4">
        <div>
          <div className="label-mono flex items-center gap-2 text-gold-700">
            <span aria-hidden className="h-px w-4 bg-gold-500" />
            Step 3 · Take payment
          </div>
          <div className="mt-1.5 text-sm text-navy-500">
            {D(s.amountPaid).greaterThan(0) ? (
              <>
                Received <span className="font-mono text-navy-800">{formatINR(s.amountPaid)}</span> of <span className="font-mono text-navy-800">{formatINR(s.grandTotal)}</span>
              </>
            ) : (
              <>
                Agreed total <span className="font-mono text-navy-800">{formatINR(s.grandTotal)}</span>
              </>
            )}
          </div>
        </div>
        <div className="sm:text-right">
          <div className="label-mono text-navy-500">Amount due</div>
          <div className="headline mt-1 text-[2.5rem] font-bold text-navy-950 tabular sm:text-[2.75rem]" data-testid="amount-due">
            {formatINR(outstanding)}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
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
          <div className="overflow-hidden rounded-lg border border-navy-200">
            <button
              type="button"
              onClick={() => setManualOpen((o) => !o)}
              className={cn(
                "flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-navy-900 transition-colors hover:bg-paper/60",
                manualOpen && "bg-paper/60",
              )}
              aria-expanded={manualOpen}
            >
              <span>Record cash, card, bank transfer or UPI received without the QR</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-navy-400 transition-transform duration-200", manualOpen && "rotate-180")} />
            </button>
            {manualOpen && (
              <div className="animate-fade-in border-t border-navy-200 p-4">
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
    <div className="rounded-lg border border-navy-200 bg-paper/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="UPI amount (₹)" htmlFor="qr-amount" className="w-44" hint={D(amount).lessThan(D(outstanding)) ? "Part payment" : "Full amount due"}>
          <Input
            id="qr-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="h-12 font-mono text-lg font-semibold tabular"
          />
        </Field>
        <div className="flex min-w-56 flex-1 flex-col">
          <Button
            variant="primary"
            size="lg"
            className="w-full tabular"
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
          {/* keeps the button level with the input when the field shows its hint */}
          <span aria-hidden className="mt-1.5 block h-4" />
        </div>
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
    <div className="animate-fade-in rounded-lg border border-navy-300 p-4 sm:p-5">
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
        <div className={cn("relative w-56 shrink-0 rounded-lg border border-navy-200 bg-white p-2.5 transition-opacity duration-300", expired && "opacity-40")}>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt={`UPI QR code for ${formatINR(payment.amount)}`} className="aspect-square w-full bg-navy-50" data-testid="upi-qr" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-sm text-navy-500">QR unavailable</div>
          )}
          {expired && <div className="absolute inset-0 flex items-center justify-center font-mono text-base font-semibold tracking-[0.08em] text-red-700">QR EXPIRED</div>}
        </div>
        <div className="w-full min-w-0 flex-1 text-center md:text-left">
          <div className="label-mono text-gold-700">Scan to pay</div>
          <div className="headline mt-1.5 text-[3rem] font-bold text-navy-950 tabular sm:text-[3.75rem]" data-testid="qr-amount">
            {formatINR(payment.amount)}
          </div>
          <dl className="mx-auto mt-3 grid max-w-sm grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-left text-sm md:mx-0">
            <dt className="label-mono pt-[3px] text-navy-500">Pay to</dt>
            <dd className="min-w-0 text-navy-800">
              {payment.provider === "upi_static" ? (
                <>
                  <b className="font-semibold">{config.businessName}</b> · <span className="break-all font-mono text-[13px]">{config.payments.upiVpa}</span>
                </>
              ) : (
                <>Razorpay dynamic QR · single use</>
              )}
            </dd>
            <dt className="label-mono pt-[3px] text-navy-500">Note</dt>
            <dd className="font-mono text-[13px] text-navy-800">{saleNumber}</dd>
            {left !== null && !expired && (
              <>
                <dt className="label-mono pt-[3px] text-navy-500">Valid for</dt>
                <dd className="font-mono text-[13px] font-medium text-navy-900 tabular">
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </dd>
              </>
            )}
          </dl>
          <div className="mt-4 rounded-md border-l-[3px] border-amber-500 bg-amber-50 px-3 py-2 text-left text-[13px] leading-relaxed text-amber-950">
            <b>Not paid yet.</b> {pd.instructions ?? "Check the shop's UPI app for the exact amount before confirming."}
          </div>
          {auto && (
            <div className="mt-2.5 flex items-center gap-2 text-sm font-medium text-navy-700">
              <Spinner /> Waiting for the gateway to confirm…
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-navy-100 pt-4">
        {canVerify && (
          <Button variant="success" size="lg" icon={<CheckCircle2 className="h-5 w-5" />} onClick={onVerify}>
            {auto ? "Confirm manually" : "Payment received — verify"}
          </Button>
        )}
        <Button variant="outline" size="lg" icon={<XCircle className="h-4 w-4" />} onClick={() => setClosing("failed")}>
          Customer couldn&apos;t pay
        </Button>
        <Button variant="ghost" size="lg" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setClosing(expired ? "expired" : "cancelled")}>
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
    <div className={cn("space-y-4", intent && "animate-fade-in rounded-lg border border-emerald-300 border-l-[3px] border-l-emerald-600 bg-emerald-50/40 p-4")}>
      {intent && (
        <div className="text-[15px] font-semibold text-emerald-950">
          Verify the UPI payment for <span className="font-mono">{formatINR(intent.amount)}</span>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {!intent && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payment method">
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
                "inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors duration-150",
                method === m
                  ? "border-navy-900 bg-navy-900 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)]"
                  : "border-navy-200 bg-white text-navy-700 hover:border-navy-400 hover:text-navy-950",
              )}
            >
              <span className={method === m ? "text-gold-400" : "text-navy-400"}>{METHOD_ICON[m]}</span> {METHOD_LABEL[m]}
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
            className="h-12 font-mono text-lg font-semibold tabular"
          />
        </Field>
        {method === "cash" ? (
          <Field
            label="Cash tendered (optional)"
            htmlFor="pay-tendered"
            hint={
              change && change.greaterThanOrEqualTo(0) ? (
                <span className="inline-block rounded-[3px] bg-emerald-50 px-1.5 text-[13px] font-semibold leading-5 text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  Return change: <span className="font-mono">{formatINR(change)}</span>
                </span>
              ) : (
                <span className="inline-block px-1.5 text-[13px] leading-5 ring-1 ring-inset ring-transparent">To calculate change</span>
              )
            }
          >
            <Input id="pay-tendered" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 font-mono text-lg tabular" />
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
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-navy-800">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="radio" name="via" checked={via === "manual_merchant_app"} onChange={() => setVia("manual_merchant_app")} className="h-4 w-4 accent-navy-900" />
            Checked in UPI / merchant app
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="radio" name="via" checked={via === "manual_bank_statement"} onChange={() => setVia("manual_bank_statement")} className="h-4 w-4 accent-navy-900" />
            Checked in bank statement
          </label>
        </div>
      )}
      {method === "cheque" && <Alert tone="warning">Record a cheque only after it has cleared in the bank account.</Alert>}
      <Field label="Note (optional)" htmlFor="pay-note">
        <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-12" />
      </Field>
      <div className={cn("rounded-lg border px-3.5 py-3 transition-colors duration-150", confirmed ? "border-emerald-300 bg-emerald-50/60" : "border-navy-200 bg-white")}>
        <Checkbox label={<span className="font-semibold text-navy-950">{confirmText[method]}</span>} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="confirm-received" />
        <p className="ml-6 mt-1 text-xs leading-relaxed text-navy-500">A button click is not proof of payment — confirm only after you have seen the money. Your name is recorded.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" size="lg" className="tabular" loading={busy} disabled={!amountValid || !refValid || !confirmed} onClick={submit} icon={<CheckCircle2 className="h-5 w-5" />}>
          Confirm {amountValid ? formatINR(amount) : ""} received
        </Button>
        {intent && (
          <Button variant="ghost" size="lg" onClick={onDone}>
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
      <div className="label-mono mb-1.5 text-navy-500">Payment records</div>
      <ul className="divide-y divide-navy-100 rounded-lg border border-navy-200">
        {payments
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <span className="text-navy-400">{METHOD_ICON[p.method]}</span>
              <span className="font-semibold text-navy-950">
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
                <span className="font-mono font-semibold text-navy-950 tabular">{formatINR(p.amount)}</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
