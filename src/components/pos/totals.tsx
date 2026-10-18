"use client";
import { useState } from "react";
import { MapPin, Percent, Truck } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { D, formatINR } from "@/lib/money";
import { STATES, stateName } from "@/lib/india";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { DiscountDialog } from "./discount-dialog";
import { ChargeDialog } from "./cart";
import { hasPerm, type Me, type PosConfig, type SaleData } from "./types";

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: "green" | "muted"; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1 text-sm", strong && "font-semibold")}>
      <dt className={tone === "muted" ? "text-navy-400" : "text-navy-600"}>{label}</dt>
      <dd className={cn("tabular", tone === "green" ? "font-semibold text-emerald-700" : "text-navy-900")}>{value}</dd>
    </div>
  );
}

export function TotalsCard({ data }: { data: SaleData }) {
  const s = data.sale;
  const items = data.lines.filter((l) => l.lineType === "item");
  const discount = D(s.lineDiscountTotal).plus(D(s.cartDiscountTotal));
  const saved = D(s.listTotal).minus(D(s.subtotalGross)).plus(discount);
  const taxCharged = s.taxMode !== "none";
  return (
    <section aria-label="Totals" className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
      <dl className="px-5 pt-4">
        <Row label={`Items (${items.length})`} value={formatINR(s.subtotalGross)} />
        {D(s.lineDiscountTotal).greaterThan(0) && <Row label="Item discounts" value={`− ${formatINR(s.lineDiscountTotal)}`} tone="green" />}
        {D(s.cartDiscountTotal).greaterThan(0) && <Row label={`Bill discount${s.cartDiscountReason ? ` (${s.cartDiscountReason})` : ""}`} value={`− ${formatINR(s.cartDiscountTotal)}`} tone="green" />}
        {D(s.chargesTotal).greaterThan(0) && <Row label="Charges" value={formatINR(s.chargesTotal)} />}
        {taxCharged ? (
          <div className="mt-2 border-t border-dashed border-navy-100 pt-2">
            <Row label="Taxable value" value={formatINR(s.taxableTotal)} tone="muted" />
            {s.taxMode === "intra" ? (
              <>
                <Row label="CGST" value={formatINR(s.cgstTotal)} tone="muted" />
                <Row label="SGST" value={formatINR(s.sgstTotal)} tone="muted" />
              </>
            ) : (
              <Row label="IGST" value={formatINR(s.igstTotal)} tone="muted" />
            )}
            {D(s.cessTotal).greaterThan(0) && <Row label="Cess" value={formatINR(s.cessTotal)} tone="muted" />}
          </div>
        ) : (
          <p className="mt-2 border-t border-dashed border-navy-100 pt-2 text-xs text-navy-500">GST is not charged on this bill (registration type).</p>
        )}
        {!D(s.roundOff).isZero() && <Row label="Round off" value={formatINR(s.roundOff)} tone="muted" />}
      </dl>
      <div className="mt-3 bg-navy-900 px-5 py-4 text-white">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-gold-400">Grand total</div>
            {saved.greaterThan(0) && (
              <div className="mt-0.5 text-xs text-navy-200">
                Customer saves {formatINR(saved)} ({s.effectiveDiscountPercent}%)
              </div>
            )}
          </div>
          <div className="text-4xl font-extrabold tracking-tight tabular" data-testid="grand-total">
            {formatINR(s.grandTotal)}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DraftOptions({ data, me, config, run }: { data: SaleData; me: Me; config: PosConfig; run: Run }) {
  const s = data.sale;
  const [discountOpen, setDiscountOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const composition = config.registrationType === "composition";
  const eligibleBase = data.lines
    .filter((l) => l.lineType === "item" && l.discountEligible)
    .reduce((a, l) => a.plus(D(l.grossAmount)).minus(D(l.lineDiscountAmount)), D(0));
  const hasItems = data.lines.some((l) => l.lineType === "item");
  return (
    <section aria-label="Sale options" className="space-y-3 rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
      <div>
        <label htmlFor="pos-place" className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-navy-700">
          <MapPin className="h-3.5 w-3.5 text-gold-600" /> Place of supply
        </label>
        <select
          id="pos-place"
          value={s.placeOfSupplyStateCode}
          disabled={composition}
          onChange={(e) => run(() => apiFetch(`/api/sales/${s.id}`, { method: "PATCH", body: { placeOfSupplyStateCode: e.target.value } }), `Place of supply: ${stateName(e.target.value)}`)}
          className="h-10 w-full rounded-lg border border-navy-200 bg-white px-3 text-sm font-semibold disabled:bg-navy-50"
        >
          {STATES.map((st) => (
            <option key={st.code} value={st.code}>
              {st.name} ({st.code}){st.code === config.businessStateCode ? " — over the counter" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-navy-500">
          {composition
            ? "Composition dealers cannot make inter-state supplies."
            : s.placeOfSupplyStateCode === config.businessStateCode
              ? "Counter sale in Gujarat: CGST + SGST. Change only if goods are delivered to / billed at an address in another state (IGST)."
              : `Inter-state supply to ${stateName(s.placeOfSupplyStateCode)}: IGST applies. The customer's address on the bill must be in this state.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {hasPerm(me, "discounts.apply") && (
          <Button variant="outline" size="sm" icon={<Percent className="h-4 w-4" />} disabled={!hasItems} onClick={() => setDiscountOpen(true)}>
            {s.cartDiscountType ? "Edit bill discount" : "Bill discount"}
          </Button>
        )}
        <Button variant="outline" size="sm" icon={<Truck className="h-4 w-4" />} onClick={() => setChargeOpen(true)}>
          Add charge
        </Button>
      </div>
      {discountOpen && (
        <DiscountDialog
          open
          onClose={() => setDiscountOpen(false)}
          title="Discount on the whole bill"
          baseAmount={eligibleBase.toFixed(2)}
          current={s.cartDiscountType ? { type: s.cartDiscountType, value: s.cartDiscountValue ?? "0" } : null}
          currentReason={s.cartDiscountReason}
          limitPercent={me.discountLimitPercent}
          reasonRequired={config.discounts.requireReasonForAnyDiscount}
          onSave={async (d, reason) => {
            await apiFetch(`/api/sales/${s.id}/discount`, { method: "PUT", body: { discount: d, reason } });
            await run(async () => {}, d ? "Bill discount applied" : "Bill discount removed");
          }}
        />
      )}
      {chargeOpen && <ChargeDialog saleId={s.id} onClose={() => setChargeOpen(false)} run={run} />}
    </section>
  );
}
