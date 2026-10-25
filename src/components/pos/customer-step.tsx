"use client";
import { useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/page";
import { BuyerFields, buyerRules, contactProblem, customerBody, formFrom, type BuyerForm, type CustomerRow } from "./buyer-form";
import type { PosConfig, SaleData } from "./types";
import { setWalkIn } from "./walk-in";

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;

/**
 * Step 3, before the QR is shown: who is buying. Name and mobile are needed to go on (the bill is
 * made out to them and shared on WhatsApp); the rest is optional unless the bill's tax rules ask for
 * it, which is checked here so it is found before the customer pays. A walk-in who gives nothing can
 * be recorded as such, except where the law wants the buyer's details.
 */
export function CustomerStep({ data, config, run, onClose }: { data: SaleData; config: PosConfig; run: Run; onClose?: () => void }) {
  const s = data.sale;
  const [form, setFormState] = useState<BuyerForm>(() => formFrom(data.customer as CustomerRow | null, s.placeOfSupplyStateCode));
  const [busy, setBusy] = useState<null | "save" | "walkin">(null);
  const [error, setError] = useState<string | null>(null);
  const rules = buyerRules(form, config, s.taxableTotal);
  const problem = contactProblem(form);
  const changing = !!onClose;

  const setForm = (update: (f: BuyerForm) => BuyerForm) => {
    setFormState(update);
    setError(null);
  };

  /** Saves on the sale, then reloads it from the server so the next step shows. Errors stay next to the form. */
  const submit = async (mode: "save" | "walkin") => {
    setBusy(mode);
    setError(null);
    try {
      await apiFetch(`/api/sales/${s.id}/customer`, { method: "POST", body: { customer: mode === "save" ? customerBody(form, s.placeOfSupplyStateCode) : null } });
      setWalkIn(s.id, mode === "walkin");
      await run(async () => {});
      onClose?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const save = () => submit("save");
  // Nothing to clear when no customer was ever saved on this sale.
  const walkIn = () => (data.customer ? submit("walkin") : (setWalkIn(s.id, true), run(async () => {}).then(() => onClose?.())));

  return (
    <section aria-label="Customer details" className="animate-rise overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
      <div className="border-b border-navy-200 px-5 py-4">
        <div className="label-mono flex items-center gap-2 text-gold-700">
          <span aria-hidden className="h-px w-4 bg-gold-500" />
          Step 3 · Customer
        </div>
        <h2 className="mt-1.5 text-lg font-semibold text-navy-950">Who is buying?</h2>
        <p className="mt-0.5 text-sm text-navy-500">The bill is made out to them and can be sent to their mobile on WhatsApp. Take this before showing the QR.</p>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {error && <Alert tone="danger">{error}</Alert>}
        <BuyerFields form={form} setForm={setForm} config={config} placeOfSupplyStateCode={s.placeOfSupplyStateCode} taxableTotal={s.taxableTotal} mobileRequired />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-navy-200 bg-paper/60 px-4 py-4 sm:px-5">
        <Button variant="gold" size="lg" loading={busy === "save"} disabled={!!busy || !!problem} onClick={save} icon={<ArrowRight className="h-5 w-5" />} data-testid="customer-continue">
          {changing ? "Save customer" : "Continue to payment"}
        </Button>
        {rules.canSkip ? (
          <Button variant="outline" size="lg" loading={busy === "walkin"} disabled={!!busy} onClick={walkIn} icon={<UserRound className="h-4 w-4" />}>
            Walk-in — no details
          </Button>
        ) : (
          <span className="text-xs text-navy-500">A bill this size can&apos;t be made without the customer&apos;s details.</span>
        )}
        {changing && (
          <Button variant="ghost" size="lg" disabled={!!busy} onClick={onClose}>
            Cancel
          </Button>
        )}
        {problem && (form.name || form.mobile) && <span className="basis-full text-xs text-navy-500">{problem}</span>}
      </div>
    </section>
  );
}

/** Above the payment: who the sale is for, with a way to change it while no bill has been made. */
export function CustomerSummary({ data, onChange }: { data: SaleData; onChange: () => void }) {
  const c = data.customer;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-navy-200 bg-white px-4 py-3 text-sm shadow-card" data-testid="customer-summary">
      <div className="flex min-w-0 items-center gap-2.5">
        <UserRound className="h-4 w-4 shrink-0 text-navy-400" aria-hidden />
        <span className="label-mono text-navy-500">Customer</span>
        {c ? (
          <span className="min-w-0 truncate">
            <b className="font-semibold text-navy-950">{c.businessName ? `${c.businessName} (${c.name})` : c.name}</b>
            {c.mobile && <span className="ml-2 font-mono text-xs text-navy-600">{c.mobile}</span>}
          </span>
        ) : (
          <span className="text-navy-700">Walk-in — no details</span>
        )}
      </div>
      <button type="button" onClick={onChange} className="text-sm font-medium text-navy-600 underline underline-offset-[3px] hover:text-navy-950">
        {c ? "Change" : "Add details"}
      </button>
    </div>
  );
}
