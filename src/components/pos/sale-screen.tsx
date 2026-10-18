"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, FileText, LockOpen, Printer, Save } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR } from "@/lib/money";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
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
import { ReasonDialog } from "./reason-dialog";
import { TaxBanner, TrainingBanner } from "./tax-banner";
import { NewSaleButton } from "./new-sale-button";
import { SaleStatusBadge } from "./sale-status";
import { hasPerm, type Me, type PosConfig, type PosUnit, type SaleData } from "./types";

const STEPS = ["Cart", "Agree amount", "Payment", "Customer & bill"] as const;

function stepOf(data: SaleData): number {
  const s = data.sale;
  if (s.status === "draft") return data.lines.some((l) => l.lineType === "item") ? 1 : 0;
  if (s.status === "finalized") return outstandingOf(data).greaterThan(0) ? 2 : 3;
  return 4;
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
  const saleId = initial.sale.id;

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

  const step = stepOf(data);
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/pos" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-navy-600 hover:bg-white" aria-label="Back to POS home">
          <ArrowLeft className="h-4 w-4" /> POS
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-extrabold text-navy-900 sm:text-2xl">{s.saleNumber}</h1>
          <SaleStatusBadge status={s.status} paymentStatus={s.paymentStatus} />
          {s.status === "completed" && <StatusBadge status={s.paymentStatus} />}
          {s.isTraining && <Badge tone="red">Training</Badge>}
          {s.source === "website_order" && <Badge tone="blue">From website order</Badge>}
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
        </div>
      </div>

      {/* Steps */}
      {s.status !== "cancelled" && (
        <ol className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === Math.min(step, 3) && step < 4 ? "step" : undefined}
              className={cn(
                "rounded-xl px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide sm:text-xs",
                i < step ? "bg-emerald-100 text-emerald-800" : i === step ? "bg-navy-900 text-white" : "bg-white text-navy-400 ring-1 ring-navy-100",
              )}
            >
              <span className="hidden sm:inline">{i + 1}. </span>
              {label}
            </li>
          ))}
        </ol>
      )}

      {s.isTraining ? <TrainingBanner /> : <TaxBanner registrationType={config.registrationType} />}

      {s.status === "cancelled" && (
        <Alert tone="danger" title="This sale was cancelled" className="mb-4">
          {s.cancelReason}
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* Left: active step + search + cart */}
        <div className="space-y-4">
          {finalized && (
            <div id="step-panel" className="scroll-mt-20 space-y-4">
              {outstanding.greaterThan(0) && <PaymentPanel data={data} config={config} me={me} run={run} />}
              {(outstanding.lessThanOrEqualTo(0) || canCredit) && hasPerm(me, "documents.issue") && <CustomerBillPanel data={data} config={config} me={me} />}
            </div>
          )}
          {draft && <ProductSearch saleId={s.id} priceListId={s.priceListId} units={units} taxCharged={s.taxMode !== "none"} onAdded={onAdded} onError={onError} />}
          <Cart data={data} me={me} config={config} units={units} editable={draft} run={run} />
          {quotations.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <FileText className="h-4 w-4" /> Quotations:
              {quotations.map((q) => (
                <Link key={q.id} href={`/pos/documents/${q.id}`} className="font-mono font-bold underline-offset-2 hover:underline">
                  {q.docNumber}
                </Link>
              ))}
              {s.quotationValidUntil && <span className="text-sky-700">· prices held until {new Date(s.quotationValidUntil).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>}
            </div>
          )}
        </div>

        {/* Right: totals + step panel */}
        <div id="checkout" className="space-y-4 lg:sticky lg:top-20">
          <TotalsCard data={data} />

          {draft && (
            <>
              <DraftOptions data={data} me={me} config={config} run={run} />
              <ApprovalCard data={data} config={config} run={run} />
              {missing.length > 0 && <Alert tone="danger" title="Price missing">No current price for: {missing.join(", ")}. Remove the item or ask an admin to set a price.</Alert>}
              <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
                <Button variant="outline" size="lg" disabled={!items.length || approvalBlocks || missing.length > 0} onClick={() => setDialog("quotation")} icon={<Save className="h-5 w-5" />}>
                  Save quotation
                </Button>
                <Button
                  variant="gold"
                  size="xl"
                  disabled={!items.length || approvalBlocks || missing.length > 0}
                  onClick={() => setDialog("finalize")}
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  data-testid="finalize"
                >
                  Finalise {items.length ? formatINR(s.grandTotal) : "amount"}
                </Button>
              </div>
              {blockedByTax && items.length > 0 && (
                <p className="text-xs text-amber-800">This is a real (non-sample) sale: it can only be finalised once the Super Admin confirms the GST registration in Settings → Tax.</p>
              )}
            </>
          )}


          {s.status === "completed" && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-card">
              <div className="flex items-center gap-2 text-lg font-extrabold text-emerald-900">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" /> Sale complete
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {bills.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-emerald-800">{DOC_TYPE_LABEL[b.docType]}</span>
                    <span className="font-mono font-bold text-navy-900">{b.docNumber}</span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
              {D(s.amountPaid).lessThan(D(s.grandTotal)) && <p className="mt-2 text-sm font-semibold text-amber-800">Balance due: {formatINR(outstanding)}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {bills[0] && (
                  <LinkButton href={`/pos/documents/${bills[0].id}`} icon={<Printer className="h-4 w-4" />}>
                    View / print bill
                  </LinkButton>
                )}
                <NewSaleButton variant="button" />
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Mobile sticky total */}
      {s.status !== "cancelled" && s.status !== "completed" && (
        <div className="no-print fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-navy-800 bg-navy-900 px-4 py-3 text-white lg:hidden">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold-400">{finalized ? "Amount due" : "Total"}</div>
            <div className="text-2xl font-extrabold tabular">{formatINR(finalized ? outstanding.toFixed(2) : s.grandTotal)}</div>
          </div>
          <a href={draft ? "#checkout" : "#step-panel"} className="rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-bold text-navy-950">
            {draft ? "Checkout" : finalized && outstanding.greaterThan(0) ? "Take payment" : "Bill"} ↓
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
