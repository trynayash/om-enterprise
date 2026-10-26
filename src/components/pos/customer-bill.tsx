"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Pencil } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { stateName } from "@/lib/india";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/page";
import { BuyerFields, buyerRules, customerBody, formFrom, type BuyerForm, type CustomerRow } from "./buyer-form";
import { outstandingOf } from "./payment-panel";
import { hasPerm, type Me, type PosConfig, type SaleData } from "./types";

/** Step 5: the bill. The customer was taken in step 3; here it is shown for a last look and can still be changed. */
export function CustomerBillPanel({ data, config, me }: { data: SaleData; config: PosConfig; me: Me }) {
  const router = useRouter();
  const s = data.sale;
  const saved = data.customer as CustomerRow | null;
  const [form, setForm] = useState<BuyerForm>(() => formFrom(saved, s.placeOfSupplyStateCode));
  // A sale that still needs the buyer's details (a large bill, or a registered buyer) opens the form at once.
  const [editing, setEditing] = useState(() => !saved && !buyerRules(formFrom(null, s.placeOfSupplyStateCode), config, s.taxableTotal).canSkip);
  const [busy, setBusy] = useState<null | "bill" | "credit">(null);
  const [error, setError] = useState<string | null>(null);

  const outstanding = outstandingOf(data);
  const paid = outstanding.lessThanOrEqualTo(0);
  const canCredit = !paid && config.discounts.allowCreditSales && hasPerm(me, "sales.credit");
  const buyer = editing ? form : saved ? formFrom(saved, s.placeOfSupplyStateCode) : null;
  const nameMissing = editing && !form.name.trim();
  const creditReady = !!buyer?.name.trim() && !!buyer.mobile.trim();

  const issue = async (credit: boolean) => {
    setBusy(credit ? "credit" : "bill");
    setError(null);
    try {
      // Only what was changed here is sent; otherwise the bill uses the customer saved on the sale.
      const doc = await apiFetch<{ id: string }>(`/api/sales/${s.id}/bill`, {
        method: "POST",
        body: { customer: editing ? customerBody(form, s.placeOfSupplyStateCode) : undefined, allowOutstanding: credit },
      });
      router.push(`/pos/documents/${doc.id}`);
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      if (/customer|address|state|GSTIN|mobile|place of supply/i.test(message)) setEditing(true);
      setBusy(null);
    }
  };

  return (
    <section aria-label="Bill" className="animate-rise overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-navy-200 px-5 py-4">
        <div>
          <div className="label-sm text-gold-700">
            Step 5 · Bill
          </div>
          <div className="mt-1.5 text-sm">
            {paid ? (
              <span className="font-semibold text-emerald-700">Payment verified: {formatINR(s.amountPaid)}</span>
            ) : (
              <span className="font-semibold text-amber-800">Balance due: {formatINR(outstanding)}</span>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {error && <Alert tone="danger">{error}</Alert>}

        {editing ? (
          <>
            <BuyerFields form={form} setForm={(update) => setForm(update)} config={config} placeOfSupplyStateCode={s.placeOfSupplyStateCode} taxableTotal={s.taxableTotal} mobileRequired={canCredit} />
            {saved && (
              <button
                type="button"
                className="text-sm font-medium text-navy-600 underline underline-offset-[3px] hover:text-navy-950"
                onClick={() => {
                  setForm(formFrom(saved, s.placeOfSupplyStateCode));
                  setEditing(false);
                  setError(null);
                }}
              >
                Keep the customer as saved
              </button>
            )}
          </>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-navy-200 bg-paper/60 px-4 py-3">
            <div className="min-w-0 text-sm" data-testid="bill-to">
              <div className="label-sm text-navy-500">Bill to</div>
              {saved ? (
                <>
                  <div className="mt-1 font-semibold text-navy-950">{saved.businessName ? `${saved.businessName} (${saved.name})` : saved.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 tabular text-xs text-navy-600">
                    {[saved.mobile, saved.email, saved.gstin].filter(Boolean).map((t) => (
                      <span key={t} className="break-all">
                        {t}
                      </span>
                    ))}
                  </div>
                  {(saved.billingAddress || saved.city) && (
                    <div className="mt-0.5 text-navy-600">{[saved.billingAddress, saved.city, saved.pincode, stateName(saved.stateCode)].filter(Boolean).join(", ")}</div>
                  )}
                </>
              ) : (
                <div className="mt-1 text-navy-700">Walk-in customer — no details on the bill.</div>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
              {saved ? "Change" : "Add details"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-navy-200 bg-paper/60 px-4 py-4 sm:px-5">
        {paid && (
          <Button variant="gold" size="lg" loading={busy === "bill"} disabled={!!busy || nameMissing} onClick={() => issue(false)} icon={<FileCheck2 className="h-5 w-5" />}>
            Generate bill
          </Button>
        )}
        {canCredit && (
          <Button variant="primary" size="lg" loading={busy === "credit"} disabled={!!busy || !creditReady} onClick={() => issue(true)}>
            Issue bill with {formatINR(outstanding)} due (credit)
          </Button>
        )}
        {canCredit && !creditReady && <span className="basis-full text-xs text-navy-500">A credit bill needs the customer&apos;s name and mobile number.</span>}
      </div>
    </section>
  );
}
