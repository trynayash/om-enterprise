"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, Ban, Check, CheckCircle2, Lock, LockOpen, Printer, Save } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, m } from "@/lib/money";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton, buttonClass } from "@/components/ui/button";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { DOC_TYPE_LABEL } from "@/lib/document-types";
import { ProductSearch } from "./product-search";
import { Cart } from "./cart";
import { DraftOptions, TotalsCard } from "./totals";
import { ApprovalCard } from "./approval";
import { FinalizeDialog, QuotationDialog } from "./checkout-dialogs";
import { PaymentPanel, outstandingOf } from "./payment-panel";
import { CustomerBillPanel } from "./customer-bill";
import { CustomerStep, CustomerSummary } from "./customer-step";
import { useWalkIn } from "./walk-in";
import { ReasonDialog } from "./reason-dialog";
import { TaxBanner, TrainingBanner } from "./tax-banner";
import { NewSaleButton } from "./new-sale-button";
import { SaleStatusBadge } from "./sale-status";
import { TrainingBadge } from "@/components/staff/labels";
import { hasPerm, type Me, type PosConfig, type PosUnit, type SaleData } from "./types";
import { DeleteRecord } from "@/components/dashboard/ops/delete-record";
import { deleteConsequences } from "@/components/dashboard/ops/delete-consequences";
import { deleteBlockedReason, deletePhrase } from "@/lib/delete-phrase";

const STEPS = ["Cart", "Agree amount", "Customer", "Payment", "Bill"] as const;
/** One word per step on a phone, so the five fit a row. */
const SHORT_STEP: Partial<Record<(typeof STEPS)[number], string>> = { "Agree amount": "Amount" };

/**
 * The customer is asked once the amount is agreed and before any payment starts. A sale already being
 * paid (started before this step existed) is not held up for it, and nor is a walk-in.
 */
function needsCustomer(data: SaleData, walkIn: boolean, canAsk: boolean): boolean {
  return canAsk && data.sale.status === "finalized" && !data.customer && !walkIn && data.payments.length === 0 && outstandingOf(data).greaterThan(0);
}

function stepOf(data: SaleData, asking: boolean): number {
  const s = data.sale;
  if (s.status === "draft") return data.lines.some((l) => l.lineType === "item") ? 1 : 0;
  if (s.status === "finalized") return asking ? 2 : outstandingOf(data).greaterThan(0) ? 3 : 4;
  return 5;
}

export function SaleScreen({ initial, config, me, units }: { initial: SaleData; config: PosConfig; me: Me; units: PosUnit[] }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<SaleData>(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    // A fresh server render (e.g. navigating back here) supersedes local state.
    setSeenInitial(initial);
    setData(initial);
  }
  const [dialog, setDialog] = useState<null | "finalize" | "quotation" | "cancel" | "reopen">(null);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const saleId = initial.sale.id;
  const walkIn = useWalkIn(saleId);

  const reload = useCallback(async () => {
    const fresh = await apiFetch<SaleData>(`/api/sales/${saleId}?refresh=1`);
    setData(fresh);
    return fresh;
  }, [saleId]);

  // Re-sync whenever this screen is shown again (Next keeps visited routes mounted but hidden).
  useEffect(() => {
    let live = true;
    apiFetch<SaleData>(`/api/sales/${saleId}?refresh=1`)
      .then((fresh) => {
        if (live) setData(fresh);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [saleId]);

  /** Run a mutation, then always re-render from the server's authoritative state. */
  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn();
        await reload();
        if (success) toast(success);
        return true;
      } catch (err) {
        toast(errorMessage(err), "error");
        await reload().catch(() => {});
        return false;
      }
    },
    [reload, toast],
  );
  const onError = useCallback((m: string) => toast(m, "error"), [toast]);
  const onAdded = useCallback(
    async (label: string) => {
      await reload();
      toast(label);
    },
    [reload, toast],
  );

  const s = data.sale;
  const pendingApproval = s.status === "draft" && s.approvalStatus === "pending";
  useEffect(() => {
    if (!pendingApproval) return;
    const t = setInterval(() => {
      reload().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [pendingApproval, reload]);

  const canAskCustomer = hasPerm(me, "sales.create");
  const asking = needsCustomer(data, walkIn, canAskCustomer);
  const step = stepOf(data, asking);
  const items = data.lines.filter((l) => l.lineType === "item");
  const draft = s.status === "draft";
  const finalized = s.status === "finalized";
  const outstanding = outstandingOf(data);
  const hasVerified = data.payments.some((p) => p.direction === "in" && p.status === "successful");
  const bills = data.documents.filter((d) => d.docType !== "quotation" && d.docType !== "credit_note");
  const quotations = data.documents.filter((d) => d.docType === "quotation");
  const missing = data.evaluation?.missingPrices ?? [];
  const approvalBlocks = !!data.evaluation?.approvalNeeded;
  const blockedByTax = !s.isTraining && config.registrationType === null;
  const canCredit = config.discounts.allowCreditSales && hasPerm(me, "sales.credit");

  return (
    <div className="pb-24 lg:pb-0">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/pos"
          className="inline-flex h-9 items-center gap-1.5 rounded-md pr-1 text-sm font-medium text-navy-500 transition-colors hover:text-navy-950"
          aria-label="Back to POS home"
        >
          <ArrowLeft className="h-4 w-4" /> POS
        </Link>
        <span aria-hidden className="h-6 w-px bg-navy-200" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="tabular text-[1.5rem] font-semibold leading-none tracking-[-0.01em] text-navy-950 sm:text-[1.75rem]">{s.saleNumber}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
            {s.status === "completed" && <StatusBadge status={s.paymentStatus} />}
            {s.isTraining && <TrainingBadge />}
            {s.source === "website_order" && <Badge>From website order</Badge>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {finalized && !hasVerified && bills.length === 0 && (
            <Button variant="outline" size="sm" icon={<LockOpen className="h-4 w-4" />} onClick={() => setDialog("reopen")}>
              Reopen to edit
            </Button>
          )}
          {(draft || (finalized && !hasVerified)) && (
            <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" icon={<Ban className="h-4 w-4" />} onClick={() => setDialog("cancel")}>
              Cancel sale
            </Button>
          )}
          {me.isSuperAdmin && (
            <DeleteRecord
              kind="sale"
              size="sm"
              id={s.id}
              name={s.saleNumber}
              phrase={deletePhrase(me.username)}
              consequences={deleteConsequences(data.documents)}
              blocked={deleteBlockedReason(m(D(s.amountPaid).minus(D(s.amountRefunded))), s.isTraining)}
              afterDelete="/pos"
            />
          )}
        </div>
      </div>

      {/* Steps: a ruled progress line — ink for done, brass for the current step. */}
      {s.status !== "cancelled" && (
        <ol className="mb-5 grid grid-cols-5 gap-2 sm:gap-3" aria-label="Progress">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={label} aria-current={i === Math.min(step, 4) && step < 5 ? "step" : undefined} className="min-w-0">
                <span
                  aria-hidden
                  className={cn(
                    "block h-[3px] origin-left transition-colors duration-300",
                    done ? "bg-navy-900" : current ? "bg-gold-500" : "bg-navy-200",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 flex items-start gap-1.5 text-[12px] leading-tight sm:items-center sm:text-[13px]",
                    done ? "text-navy-700" : current ? "font-semibold text-navy-950" : "text-navy-400",
                  )}
                >
                  <span aria-hidden className={cn("hidden tabular text-xs sm:inline", current ? "text-gold-700" : "text-navy-400")}>
                    {done ? <Check className="h-3.5 w-3.5 text-navy-900" strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className="sr-only sm:hidden">{i + 1}. </span>
                  <span className="sm:hidden">{SHORT_STEP[label] ?? label}</span>
                  <span className="max-sm:hidden">{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* The GST notice is about issuing a bill, so it only matters while the sale is being built or paid. */}
      {s.isTraining ? <TrainingBanner /> : (draft || finalized) && <TaxBanner registrationType={config.registrationType} />}

      {s.status === "cancelled" && (
        <Alert tone="danger" title="This sale was cancelled" className="mb-4">
          {s.cancelReason}
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Left: active step + search + cart */}
        <div className="space-y-4">
          {finalized && (
            <div id="step-panel" className="scroll-mt-28 space-y-4 lg:scroll-mt-20">
              {asking || changingCustomer ? (
                <CustomerStep data={data} config={config} run={run} onClose={changingCustomer ? () => setChangingCustomer(false) : undefined} />
              ) : (
                <>
                  {outstanding.greaterThan(0) && (
                    <>
                      {canAskCustomer && <CustomerSummary data={data} onChange={() => setChangingCustomer(true)} />}
                      <PaymentPanel data={data} config={config} me={me} run={run} />
                    </>
                  )}
                  {(outstanding.lessThanOrEqualTo(0) || canCredit) && hasPerm(me, "documents.issue") && <CustomerBillPanel data={data} config={config} me={me} />}
                </>
              )}
            </div>
          )}
          {draft && <ProductSearch saleId={s.id} priceListId={s.priceListId} units={units} taxCharged={s.taxMode !== "none"} onAdded={onAdded} onError={onError} />}
          <Cart data={data} me={me} config={config} units={units} editable={draft} run={run} />
          {quotations.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-navy-200 bg-white px-4 py-3 text-sm">
              <span className="label-sm text-navy-500">Quotations</span>
              {quotations.map((q) => (
                <Link key={q.id} href={`/pos/documents/${q.id}`} className="link-draw tabular font-medium text-navy-950">
                  {q.docNumber}
                </Link>
              ))}
              {s.quotationValidUntil && (
                <span className="text-navy-500">· prices held until {new Date(s.quotationValidUntil).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
              )}
            </div>
          )}
        </div>

        {/* Right: totals + step panel */}
        <div id="checkout" className="scroll-mt-28 space-y-4 lg:sticky lg:top-20 lg:scroll-mt-20">
          <TotalsCard data={data} />

          {draft && (
            <>
              <DraftOptions data={data} me={me} config={config} run={run} />
              <ApprovalCard data={data} config={config} run={run} />
              {missing.length > 0 && <Alert tone="danger" title="Price missing">No current price for: {missing.join(", ")}. Remove the item or ask an admin to set a price.</Alert>}
              <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                <Button
                  variant="outline"
                  size="lg"
                  className="sm:h-16"
                  disabled={!items.length || approvalBlocks || missing.length > 0}
                  onClick={() => setDialog("quotation")}
                  icon={<Save className="h-[18px] w-[18px]" />}
                >
                  Save quotation
                </Button>
                <Button
                  variant="gold"
                  size="xl"
                  className="tabular"
                  // A real sale can't be finalised until GST registration is confirmed (the server refuses it too); training sales can.
                  disabled={!items.length || approvalBlocks || missing.length > 0 || blockedByTax}
                  onClick={() => setDialog("finalize")}
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  data-testid="finalize"
                  aria-describedby={blockedByTax ? "finalize-blocked" : undefined}
                >
                  Finalise {items.length ? formatINR(s.grandTotal) : "amount"}
                </Button>
              </div>
              {blockedByTax && (
                <p id="finalize-blocked" className="flex items-start gap-2 text-[13px] leading-relaxed text-amber-900">
                  <Lock className="mt-[3px] h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    Finalising is locked: real (non-sample) sales need the GST registration confirmed in Settings → Tax first. You can still save a quotation.
                  </span>
                </p>
              )}
            </>
          )}

          {s.status === "completed" && (
            <section className="animate-rise overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
              <div className="flex items-center gap-2.5 border-b border-emerald-200 bg-emerald-50 px-5 py-3.5 text-emerald-900">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="text-[15px] font-semibold">Sale complete</span>
              </div>
              <div className="px-5 py-4">
                <ul className="divide-y divide-navy-100 text-sm">
                  {bills.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0">
                      <span className="label-sm text-navy-500">{DOC_TYPE_LABEL[b.docType]}</span>
                      <span className="tabular font-semibold text-navy-950">{b.docNumber}</span>
                      <StatusBadge status={b.status} className="ml-auto" />
                    </li>
                  ))}
                </ul>
                {D(s.amountPaid).lessThan(D(s.grandTotal)) && (
                  <p className="mt-3 text-sm font-semibold text-amber-800">
                    Balance due: <span className="tabular">{formatINR(outstanding)}</span>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {bills[0] && (
                    <LinkButton href={`/pos/documents/${bills[0].id}`} icon={<Printer className="h-4 w-4" />}>
                      View / print bill
                    </LinkButton>
                  )}
                  <NewSaleButton variant="button" />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Mobile sticky total */}
      {s.status !== "cancelled" && s.status !== "completed" && (
        <div data-bottom-bar className="no-print fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-white/10 bg-navy-950 px-4 py-2.5 text-white lg:hidden">
          <div className="min-w-0">
            <div className="label-sm text-gold-400">{finalized ? "Amount due" : "Total"}</div>
            <div className="headline mt-0.5 text-[1.625rem] font-bold tabular">{formatINR(finalized ? outstanding.toFixed(2) : s.grandTotal)}</div>
          </div>
          <a href={draft ? "#checkout" : "#step-panel"} className={buttonClass("gold", "lg", "shrink-0")}>
            {draft ? "Checkout" : asking ? "Customer" : finalized && outstanding.greaterThan(0) ? "Take payment" : "Bill"} <ArrowDown className="h-4 w-4" />
          </a>
        </div>
      )}

      {dialog === "finalize" && <FinalizeDialog data={data} onClose={() => setDialog(null)} run={run} />}
      {dialog === "quotation" && <QuotationDialog data={data} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title={`Cancel sale ${s.saleNumber}?`}
          description="The sale is kept for the record with your reason. This cannot be undone."
          confirmLabel="Cancel sale"
          confirmVariant="danger"
          onConfirm={async (reason) => {
            await apiFetch(`/api/sales/${s.id}/cancel`, { method: "POST", body: { reason } });
            setDialog(null);
            toast("Sale cancelled");
            router.push("/pos");
          }}
        />
      )}
      {dialog === "reopen" && (
        <ReasonDialog
          open
          onClose={() => setDialog(null)}
          title="Reopen to edit?"
          description="The agreed amount is unlocked and any open QR is cancelled. Prices will be refreshed to current prices."
          confirmLabel="Reopen"
          onConfirm={async (reason) => {
            await apiFetch(`/api/sales/${s.id}/reopen`, { method: "POST", body: { reason } });
            await run(async () => {}, "Sale reopened");
          }}
        />
      )}
    </div>
  );
}
