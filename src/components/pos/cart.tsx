"use client";
import { useState } from "react";
import { Minus, Percent, Plus, ShoppingCart, Tag, Trash2, Truck } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";
import { Badge, SampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { cn } from "@/components/ui/cn";
import { DiscountDialog } from "./discount-dialog";
import { hasPerm, type Me, type PosConfig, type PosUnit, type SaleData, type SaleLineJson } from "./types";

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;

export function Cart({
  data,
  me,
  config,
  units,
  editable,
  run,
}: {
  data: SaleData;
  me: Me;
  config: PosConfig;
  units: PosUnit[];
  editable: boolean;
  run: Run;
}) {
  const { sale, lines } = data;
  const items = lines.filter((l) => l.lineType === "item");
  const charges = lines.filter((l) => l.lineType === "charge");
  const taxCharged = sale.taxMode !== "none";
  const [discountFor, setDiscountFor] = useState<SaleLineJson | null>(null);
  const [overrideFor, setOverrideFor] = useState<SaleLineJson | null>(null);

  if (!lines.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-navy-200 bg-white/70 px-6 py-14 text-center">
        <ShoppingCart className="h-10 w-10 text-navy-200" />
        <div className="mt-3 text-base font-bold text-navy-900">The cart is empty</div>
        <p className="mt-1 max-w-sm text-sm text-navy-500">Search above and add the products the customer wants. Prices, discounts and GST are calculated automatically.</p>
      </div>
    );
  }

  return (
    <section aria-label="Cart" className="@container overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy-700">
          <ShoppingCart className="h-4 w-4 text-gold-600" /> Cart · {items.length} item{items.length === 1 ? "" : "s"}
        </h2>
        {taxCharged && <span className="hidden text-xs text-navy-500 @lg:inline">Rates as configured (incl./+ GST shown per line)</span>}
      </div>
      <ul className="divide-y divide-navy-50">
        {items.map((l) => (
          <CartLine
            key={l.id}
            line={l}
            saleId={sale.id}
            units={units}
            taxCharged={taxCharged}
            editable={editable}
            canDiscount={hasPerm(me, "discounts.apply") && l.discountEligible}
            canOverride={hasPerm(me, "pricing.override_price")}
            showCostFlags={data.canSeeCosts}
            run={run}
            onDiscount={() => setDiscountFor(l)}
            onOverride={() => setOverrideFor(l)}
          />
        ))}
        {charges.map((l) => (
          <ChargeLine key={l.id} line={l} saleId={sale.id} editable={editable} taxCharged={taxCharged} run={run} />
        ))}
      </ul>

      {discountFor && (
        <DiscountDialog
          open
          onClose={() => setDiscountFor(null)}
          title={`Discount — ${discountFor.productName}${discountFor.variantName ? ` · ${discountFor.variantName}` : ""}`}
          baseAmount={discountFor.grossAmount}
          current={discountFor.lineDiscountType ? { type: discountFor.lineDiscountType, value: discountFor.lineDiscountValue ?? "0" } : null}
          currentReason={discountFor.lineDiscountReason}
          limitPercent={me.discountLimitPercent}
          reasonRequired={config.discounts.requireReasonForAnyDiscount}
          onSave={async (d, reason) => {
            await apiFetch(`/api/sales/${sale.id}/lines/${discountFor.id}`, { method: "PATCH", body: { discount: d, discountReason: reason } });
            await run(async () => {}, d ? "Discount applied" : "Discount removed");
          }}
        />
      )}
      {overrideFor && <OverrideDialog line={overrideFor} saleId={sale.id} onClose={() => setOverrideFor(null)} run={run} />}
    </section>
  );
}

function CartLine({
  line: l,
  saleId,
  units,
  taxCharged,
  editable,
  canDiscount,
  canOverride,
  showCostFlags,
  run,
  onDiscount,
  onOverride,
}: {
  line: SaleLineJson;
  saleId: string;
  units: PosUnit[];
  taxCharged: boolean;
  editable: boolean;
  canDiscount: boolean;
  canOverride: boolean;
  showCostFlags: boolean;
  run: Run;
  onDiscount: () => void;
  onOverride: () => void;
}) {
  const unit = units.find((u) => u.code === l.unitCode);
  const decimals = unit?.decimals ?? 0;
  const [qty, setQty] = useState(D(l.quantity).toString());
  const [lastServerQty, setLastServerQty] = useState(l.quantity);
  if (lastServerQty !== l.quantity) {
    // Server changed the quantity (e.g. merged lines): adopt it.
    setLastServerQty(l.quantity);
    setQty(D(l.quantity).toString());
  }
  const re = decimals > 0 ? new RegExp(`^\\d{1,7}(\\.\\d{1,${decimals}})?$`) : /^\d{1,7}$/;
  const commit = async (value: string) => {
    if (!re.test(value) || D(value).lessThanOrEqualTo(0)) {
      setQty(D(l.quantity).toString());
      return;
    }
    if (D(value).equals(D(l.quantity))) return;
    await run(() => apiFetch(`/api/sales/${saleId}/lines/${l.id}`, { method: "PATCH", body: { quantity: value } }));
  };
  const step = (delta: number) => {
    const next = D(re.test(qty) ? qty : l.quantity).plus(delta);
    if (next.lessThanOrEqualTo(0)) return;
    setQty(next.toString());
    void commit(next.toString());
  };
  const discount = D(l.lineDiscountAmount).plus(D(l.cartDiscountShare));
  const overridden = l.priceSource === "override";

  return (
    <li className="px-4 py-3 sm:px-5">
      {/* Narrow column: info / [qty | price + total]. Wide column: info | qty | price | total. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 @2xl:grid-cols-[minmax(0,1fr)_auto_8rem_7.5rem]">
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-navy-900">{l.productName}</span>
            {l.isSample && <SampleBadge label="Sample" />}
          </div>
          {l.variantName && <div className="text-sm text-navy-700">{l.variantName}</div>}
          <div className="text-xs text-navy-400">
            {l.sku}
            {l.hsnCode ? ` · HSN ${l.hsnCode}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {l.priceSource === "quantity_tier" && <Badge tone="gold">Bulk price</Badge>}
            {l.priceSource === "quotation" && <Badge tone="blue">Quoted price</Badge>}
            {overridden && (
              <Badge tone="purple">
                <Tag className="h-3 w-3" /> Price changed{l.overrideReason ? `: ${l.overrideReason}` : ""}
              </Badge>
            )}
            {l.lineDiscountType && (
              <Badge tone="green">
                −{l.lineDiscountType === "percent" ? `${D(l.lineDiscountValue).toString()}%` : formatINR(l.lineDiscountValue)}
                {l.lineDiscountReason ? ` · ${l.lineDiscountReason}` : ""}
              </Badge>
            )}
            {showCostFlags && l.belowCost && <Badge tone="red">Below cost</Badge>}
            {showCostFlags && !l.belowCost && l.belowMarginFloor && <Badge tone="amber">Below margin floor</Badge>}
          </div>
        </div>

        <div className="flex items-center">
          {editable ? (
            <>
              <button type="button" onClick={() => step(-1)} className="h-11 w-11 rounded-l-xl border border-r-0 border-navy-200 bg-white text-navy-700 hover:bg-navy-50" aria-label={`Decrease ${l.productName}`}>
                <Minus className="mx-auto h-4 w-4" />
              </button>
              <input
                value={qty}
                inputMode={decimals ? "decimal" : "numeric"}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
                onBlur={() => void commit(qty)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                aria-label={`Quantity of ${l.productName}`}
                className="h-11 w-20 border border-navy-200 bg-white text-center text-base font-bold tabular focus:border-gold-500 focus:outline-none"
              />
              <button type="button" onClick={() => step(1)} className="h-11 w-11 rounded-r-xl border border-l-0 border-navy-200 bg-white text-navy-700 hover:bg-navy-50" aria-label={`Increase ${l.productName}`}>
                <Plus className="mx-auto h-4 w-4" />
              </button>
              <span className="ml-2 w-14 text-xs text-navy-500">{unit?.name ?? l.unitCode}</span>
            </>
          ) : (
            <span className="text-sm font-semibold tabular">
              {formatQty(l.quantity)} <span className="text-navy-500">{unit?.name ?? l.unitCode}</span>
            </span>
          )}
        </div>

        <div className="hidden text-right @2xl:block">
          <div className="text-sm tabular">
            {overridden && D(l.priceListUnitPrice).greaterThan(D(l.unitPrice)) && <span className="mr-1 text-xs text-navy-400 line-through">{formatINR(l.priceListUnitPrice)}</span>}
            {formatINR(l.unitPrice)}
          </div>
          <div className="text-[11px] text-navy-400">
            each{taxCharged ? (l.priceIncludesTax ? " · incl. GST" : " · + GST") : ""}
          </div>
          {discount.greaterThan(0) && <div className="text-xs font-semibold text-emerald-700 tabular">− {formatINR(discount)}</div>}
        </div>

        <div className="text-right">
          <div className="text-lg font-extrabold text-navy-900 tabular">{formatINR(l.lineTotal)}</div>
          <div className="text-[11px] text-navy-400 @2xl:hidden">
            {formatINR(l.unitPrice)} each{taxCharged ? (l.priceIncludesTax ? " incl. GST" : " + GST") : ""}
            {discount.greaterThan(0) && <span className="ml-1 font-semibold text-emerald-700">− {formatINR(discount)}</span>}
          </div>
          {taxCharged && D(l.gstRate).greaterThan(0) && <div className="text-[11px] text-navy-400">GST {D(l.gstRate).toString()}%</div>}
        </div>
      </div>

      {editable && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canDiscount && (
            <Button size="sm" variant="ghost" icon={<Percent className="h-3.5 w-3.5" />} onClick={onDiscount}>
              {l.lineDiscountType ? "Edit discount" : "Discount"}
            </Button>
          )}
          {canOverride && (
            <Button size="sm" variant="ghost" icon={<Tag className="h-3.5 w-3.5" />} onClick={onOverride}>
              {overridden ? "Edit price" : "Change price"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-700 hover:bg-red-50"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => run(() => apiFetch(`/api/sales/${saleId}/lines/${l.id}`, { method: "DELETE" }), "Removed from cart")}
          >
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

function ChargeLine({ line: l, saleId, editable, taxCharged, run }: { line: SaleLineJson; saleId: string; editable: boolean; taxCharged: boolean; run: Run }) {
  return (
    <li className="flex flex-wrap items-center gap-3 bg-navy-50/40 px-4 py-3 sm:px-5">
      <Truck className="h-4 w-4 text-navy-400" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-navy-900">{l.productName}</div>
        <div className="text-xs text-navy-500">
          Charge{taxCharged && D(l.gstRate).greaterThan(0) ? ` · GST ${D(l.gstRate).toString()}% ${l.priceIncludesTax ? "incl." : "extra"}` : ""}
          {l.hsnCode ? ` · SAC ${l.hsnCode}` : ""}
        </div>
      </div>
      <div className="text-base font-extrabold tabular">{formatINR(l.lineTotal)}</div>
      {editable && (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-700 hover:bg-red-50"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => run(() => apiFetch(`/api/sales/${saleId}/lines/${l.id}`, { method: "DELETE" }), "Charge removed")}
        >
          Remove
        </Button>
      )}
    </li>
  );
}

function OverrideDialog({ line, saleId, onClose, run }: { line: SaleLineJson; saleId: string; onClose: () => void; run: Run }) {
  const overridden = line.priceSource === "override";
  const [price, setPrice] = useState(overridden ? D(line.unitPrice).toFixed(2) : "");
  const [reason, setReason] = useState(line.overrideReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d{1,10}(\.\d{1,2})?$/.test(price);
  const save = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/sales/${saleId}/lines/${line.id}`, { method: "PATCH", body });
      await run(async () => {}, msg);
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
      title="Change unit price"
      description={`${line.productName}${line.variantName ? ` · ${line.variantName}` : ""} — list price ${formatINR(line.priceListUnitPrice)}`}
      footer={
        <>
          {overridden && (
            <Button variant="ghost" className="mr-auto" onClick={() => save({ overridePrice: null }, "List price restored")} disabled={busy}>
              Restore list price
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!valid || !reason.trim()} onClick={() => save({ overridePrice: price, overrideReason: reason.trim() }, "Price changed")}>
            Save price
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Alert tone="info">A lower price counts as a discount against your limit. Below-cost prices need approval.</Alert>
        <Field label="New unit price (₹, same tax basis as the list price)" htmlFor="ovr-price">
          <Input id="ovr-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 text-lg font-bold tabular" autoFocus />
        </Field>
        <Field label="Reason" htmlFor="ovr-reason" required>
          <Textarea id="ovr-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="min-h-16" />
        </Field>
      </div>
    </Dialog>
  );
}

export function ChargeDialog({ saleId, onClose, run }: { saleId: string; onClose: () => void; run: Run }) {
  const [label, setLabel] = useState("Delivery charges");
  const [amount, setAmount] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [incl, setIncl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = label.trim().length >= 2 && /^\d{1,10}(\.\d{1,2})?$/.test(amount) && D(amount).greaterThan(0);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a charge"
      description="Delivery, loading or other charges billed with this sale."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await apiFetch(`/api/sales/${saleId}/charges`, { method: "POST", body: { label: label.trim(), amount, gstRate, priceIncludesTax: incl } });
                await run(async () => {}, "Charge added");
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Add charge
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
        <Field label="Description" htmlFor="chg-label" className="sm:col-span-2">
          <Input id="chg-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Amount (₹)" htmlFor="chg-amt">
          <Input id="chg-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="font-bold tabular" autoFocus />
        </Field>
        <Field label="GST rate" htmlFor="chg-gst" hint="Confirm the applicable rate with your accountant">
          <select id="chg-gst" value={gstRate} onChange={(e) => setGstRate(e.target.value)} className="h-10 w-full rounded-lg border border-navy-200 bg-white px-3 text-sm">
            <option value="0">0%</option>
            <option value="5">5%</option>
            <option value="18">18%</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setIncl(v)}
                className={cn("h-10 rounded-lg border text-sm font-semibold", incl === v ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-700")}
              >
                {v ? "Amount includes GST" : "GST extra"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
