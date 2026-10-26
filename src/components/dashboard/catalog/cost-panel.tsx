"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { DateTime } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR } from "@/lib/money";
import { landedUnitCost } from "@/lib/pricing/engine";
import { marginInfo, type CatalogPermissions, type CostDTO, type PriceVersionDTO, type PricingContextDTO, type RegType, type SupplierOption, type VariantRow } from "./types";

const COST_RE = /^\d{1,10}(\.\d{1,4})?$/;
const RATE_RE = /^\d{1,3}(\.\d{1,3})?$/;

export function CostPanel({
  variant,
  cost,
  retail,
  ctx,
  suppliers,
  regType,
  perms,
  unitName,
}: {
  variant: VariantRow;
  cost: CostDTO | null;
  retail: PriceVersionDTO | undefined;
  ctx: PricingContextDTO;
  suppliers: SupplierOption[];
  regType: RegType;
  perms: CatalogPermissions;
  unitName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const itcPolicy = regType === "regular" ? "recoverable" : "non_recoverable";
  const [f, setF] = useState({
    purchaseCost: "",
    purchaseTaxRate: String(Number(ctx.gstRate)),
    freight: "0",
    handling: "0",
    otherCosts: "0",
    supplierId: "",
    sourceRef: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));

  const valid =
    COST_RE.test(f.purchaseCost) && RATE_RE.test(f.purchaseTaxRate) && [f.freight, f.handling, f.otherCosts].every((x) => COST_RE.test(x || "0")) && f.reason.trim().length >= 3;
  const preview = COST_RE.test(f.purchaseCost)
    ? landedUnitCost({ purchaseCost: f.purchaseCost, purchaseTaxRate: RATE_RE.test(f.purchaseTaxRate) ? f.purchaseTaxRate : "0", freight: f.freight || "0", handling: f.handling || "0", otherCosts: f.otherCosts || "0", itcPolicy })
    : null;
  const before = retail && cost ? marginInfo(retail.price, retail.priceIncludesTax, ctx, cost.landedCost, regType) : null;
  const after = retail && preview ? marginInfo(retail.price, retail.priceIncludesTax, ctx, preview.toFixed(4), regType) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/admin/costs", {
        method: "POST",
        body: {
          variantId: variant.id,
          purchaseCost: f.purchaseCost,
          purchaseTaxRate: f.purchaseTaxRate,
          freight: f.freight || "0",
          handling: f.handling || "0",
          otherCosts: f.otherCosts || "0",
          supplierId: f.supplierId || null,
          sourceRef: f.sourceRef.trim() || null,
          reason: f.reason.trim(),
        },
      });
      toast("Cost recorded");
      setF((s) => ({ ...s, purchaseCost: "", sourceRef: "", reason: "" }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!perms.canSeeCosts) {
    return <p className="text-sm text-navy-500">Purchase costs and margins are visible only to users with cost access.</p>;
  }

  return (
    <div className="space-y-5">
      {cost ? (
        <div className="rounded-lg border border-navy-100 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="label-sm text-navy-500">Current landed cost per {unitName}</div>
              <div className="headline mt-1.5 text-[1.5rem] font-bold tabular">{formatINR(cost.landedCost)}</div>
            </div>
            <div className="text-xs text-navy-500">
              since <DateTime value={cost.effectiveFrom} />
              {cost.sourceRef ? ` · ref ${cost.sourceRef}` : ""}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-navy-100 pt-3 text-sm sm:grid-cols-3">
            <Row k="Purchase (excl. GST)" v={formatINR(cost.purchaseCost)} />
            <Row k="Purchase GST" v={`${Number(cost.purchaseTaxRate)}% · ${cost.itcPolicy === "recoverable" ? "claimed as ITC" : "added to cost"}`} />
            <Row k="Freight" v={formatINR(cost.freight)} />
            <Row k="Handling" v={formatINR(cost.handling)} />
            <Row k="Other" v={formatINR(cost.otherCosts)} />
          </dl>
        </div>
      ) : (
        <Alert tone="warning" title="Cost not recorded">Profit and margin can&apos;t be calculated for this variant until a purchase cost is recorded. Reports exclude it from gross profit.</Alert>
      )}

      {perms.canEditCosts ? (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-rule bg-paper/50 p-4 sm:p-5">
          <h3 className="border-b border-rule pb-3 text-[15px] font-semibold text-navy-900">Record a new purchase cost</h3>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Purchase cost (excl. GST)" htmlFor="c-cost" required hint={`Per ${unitName}, from the supplier bill.`}>
              <Input id="c-cost" inputMode="decimal" className="tabular" value={f.purchaseCost} onChange={(e) => set("purchaseCost", e.target.value)} required />
            </Field>
            <Field label="GST on purchase %" htmlFor="c-rate">
              <Input id="c-rate" inputMode="decimal" className="tabular" value={f.purchaseTaxRate} onChange={(e) => set("purchaseTaxRate", e.target.value)} />
            </Field>
            <Field label="Supplier" htmlFor="c-supplier">
              <Select id="c-supplier" value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="">— Not specified —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Freight per unit" htmlFor="c-freight">
              <Input id="c-freight" inputMode="decimal" className="tabular" value={f.freight} onChange={(e) => set("freight", e.target.value)} />
            </Field>
            <Field label="Handling / loading" htmlFor="c-handling">
              <Input id="c-handling" inputMode="decimal" className="tabular" value={f.handling} onChange={(e) => set("handling", e.target.value)} />
            </Field>
            <Field label="Other non-recoverable" htmlFor="c-other">
              <Input id="c-other" inputMode="decimal" className="tabular" value={f.otherCosts} onChange={(e) => set("otherCosts", e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2 rounded-lg border border-navy-100 bg-white px-3 py-2.5 text-xs leading-relaxed text-navy-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" />
            {regType === "regular"
              ? "Regular GST registration: GST paid on purchases is claimed as input tax credit, so it is NOT added to the landed cost. Enter freight/handling excluding any GST you can claim."
              : "Not registered as a regular GST taxpayer: GST paid on purchases can't be claimed back, so it IS added to the landed cost."}
          </div>
          {preview && (
            <div
              className={cn(
                "grid gap-2 rounded-lg border px-3 py-2.5 text-sm sm:grid-cols-3",
                after?.belowCost ? "border-red-200 bg-red-50 text-red-900" : after?.belowFloor ? "border-amber-200 bg-amber-50 text-amber-900" : "border-navy-100 bg-white text-navy-800",
              )}
            >
              <div>
                Landed cost: <b className="tabular">{formatINR(preview)}</b>
              </div>
              {after && (
                <div>
                  Margin at current price: <b className="tabular">{after.margin ? `${after.margin.toFixed(1)}%` : "—"}</b>
                  {before?.margin && <span className="text-navy-500"> (was {before.margin.toFixed(1)}%)</span>}
                </div>
              )}
              {after?.belowCost && <div className="font-semibold">Current price would be below cost — review the price.</div>}
              {!after?.belowCost && after?.belowFloor && <div className="font-semibold">Below the {Number(ctx.minMarginPercent)}% margin floor.</div>}
              {!retail && <div className="text-navy-500">No selling price yet.</div>}
              {preview && cost && <div className="text-navy-500">Change: {D(preview).minus(D(cost.landedCost)).greaterThanOrEqualTo(0) ? "+" : ""}{formatINR(D(preview).minus(D(cost.landedCost)))}</div>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field label="Bill / reference" htmlFor="c-ref">
              <Input id="c-ref" value={f.sourceRef} onChange={(e) => set("sourceRef", e.target.value)} maxLength={120} placeholder="Supplier bill no." />
            </Field>
            <Field label="Source / reason" htmlFor="c-reason" required>
              <Textarea id="c-reason" rows={1} value={f.reason} onChange={(e) => set("reason", e.target.value)} maxLength={300} placeholder="e.g. Purchase bill dated 12 Oct" required />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy} disabled={!valid}>
              Record cost
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-navy-500">Only users allowed to record costs can change this.</p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label-sm text-navy-500">{k}</dt>
      <dd className="mt-0.5 tabular text-[13px] font-medium">{v}</dd>
    </div>
  );
}
