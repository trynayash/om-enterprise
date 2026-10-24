"use client";
import { useState } from "react";
import { Minus, Percent, Plus, Tag, Trash2 } from "lucide-react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, formatQty } from "@/lib/money";
import { Badge, SampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
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
      <div className="blueprint flex flex-col items-center justify-center rounded-xl border border-navy-200 px-6 py-14 text-center">
        <div className="label-mono text-navy-500">Cart · 0 items</div>
        <div className="mt-2 text-base font-semibold text-navy-950">The cart is empty</div>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-navy-500">Search above and add the products the customer wants. Prices, discounts and GST are calculated automatically.</p>
      </div>
    );
  }

  return (
    <section aria-label="Cart" className="@container overflow-hidden rounded-xl border border-navy-200 bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-navy-200 bg-paper/60 px-4 py-2.5 sm:px-5">
        <h2 className="label-mono text-navy-700">
          Cart <span className="text-navy-300">·</span> {items.length} item{items.length === 1 ? "" : "s"}
        </h2>
        {taxCharged && <span className="hidden text-xs text-navy-500 @lg:inline">Rates as configured (incl./+ GST shown per line)</span>}
      </div>
      <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_12rem_8rem_7.5rem] gap-x-4 border-b border-navy-100 px-5 py-2 text-navy-400 @2xl:grid">
        <span className="label-mono">Item</span>
        <span className="label-mono">Qty</span>
        <span className="label-mono text-right">Rate</span>
        <span className="label-mono text-right">Amount</span>
      </div>
      <ul className="divide-y divide-navy-100">
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
    <li className="animate-[rise_320ms_var(--ease-out-quart)_both] px-4 py-3.5 sm:px-5">
      {/* Narrow column: info / [qty | price + total]. Wide column: info | qty | price | total. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 @2xl:grid-cols-[minmax(0,1fr)_12rem_8rem_7.5rem]">
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-navy-950">{l.productName}</span>
            {l.isSample && <SampleBadge label="Sample" />}
          </div>
          {l.variantName && <div className="text-sm text-navy-700">{l.variantName}</div>}
          <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-navy-500">
            <span>{l.sku}</span>
            {l.hsnCode && <span>HSN {l.hsnCode}</span>}
          </div>
          {(l.priceSource === "quantity_tier" || l.priceSource === "quotation" || overridden || l.lineDiscountType || (showCostFlags && (l.belowCost || l.belowMarginFloor))) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {l.priceSource === "quantity_tier" && <Badge tone="gold">Bulk price</Badge>}
              {l.priceSource === "quotation" && <Badge tone="blue">Quoted price</Badge>}
              {overridden && <Badge tone="purple">Price changed{l.overrideReason ? `: ${l.overrideReason}` : ""}</Badge>}
              {l.lineDiscountType && (
                <Badge tone="green">
                  −{l.lineDiscountType === "percent" ? `${D(l.lineDiscountValue).toString()}%` : formatINR(l.lineDiscountValue)}
                  {l.lineDiscountReason ? ` · ${l.lineDiscountReason}` : ""}
                </Badge>
              )}
              {showCostFlags && l.belowCost && <Badge tone="red">Below cost</Badge>}
              {showCostFlags && !l.belowCost && l.belowMarginFloor && <Badge tone="amber">Below margin floor</Badge>}
            </div>
          )}
        </div>

        <div className="flex items-center">
          {editable ? (
            <>
              <div className="flex h-11 items-stretch overflow-hidden rounded-lg border border-navy-200 bg-white focus-within:border-navy-800 focus-within:ring-[3px] focus-within:ring-gold-300/45">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="w-10 text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100"
                  aria-label={`Decrease ${l.productName}`}
                >
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
                  className="w-16 border-x border-navy-200 bg-white text-center font-mono text-base font-semibold text-navy-950 tabular focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="w-10 text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100"
                  aria-label={`Increase ${l.productName}`}
                >
                  <Plus className="mx-auto h-4 w-4" />
                </button>
              </div>
              <span className="ml-2.5 w-14 text-xs text-navy-500">{unit?.name ?? l.unitCode}</span>
            </>
          ) : (
            <span className="text-sm">
              <span className="font-mono font-semibold text-navy-950 tabular">{formatQty(l.quantity)}</span> <span className="text-navy-500">{unit?.name ?? l.unitCode}</span>
            </span>
          )}
        </div>

        <div className="hidden text-right @2xl:block">
          <div className="font-mono text-sm text-navy-900 tabular">
            {overridden && D(l.priceListUnitPrice).greaterThan(D(l.unitPrice)) && <span className="mr-1.5 text-xs text-navy-400 line-through">{formatINR(l.priceListUnitPrice)}</span>}
            {formatINR(l.unitPrice)}
          </div>
          <div className="mt-0.5 text-[11px] text-navy-500">
            each{taxCharged ? (l.priceIncludesTax ? " · incl. GST" : " · + GST") : ""}
          </div>
          {discount.greaterThan(0) && <div className="mt-0.5 font-mono text-xs font-medium text-emerald-700 tabular">− {formatINR(discount)}</div>}
        </div>

        <div className="text-right">
          <div className="font-mono text-[17px] font-semibold text-navy-950 tabular">{formatINR(l.lineTotal)}</div>
          <div className="mt-0.5 text-[11px] text-navy-500 @2xl:hidden">
            <span className="font-mono">{formatINR(l.unitPrice)}</span> each{taxCharged ? (l.priceIncludesTax ? " incl. GST" : " + GST") : ""}
            {discount.greaterThan(0) && <span className="ml-1 font-mono font-medium text-emerald-700">− {formatINR(discount)}</span>}
          </div>
          {taxCharged && D(l.gstRate).greaterThan(0) && <div className="mt-0.5 font-mono text-[11px] text-navy-400">GST {D(l.gstRate).toString()}%</div>}
        </div>
      </div>

      {editable && (
        <div className="-ml-2.5 mt-2 flex flex-wrap gap-0.5">
          {canDiscount && (
            <Button size="sm" variant="ghost" className="px-2.5 font-medium text-navy-700" icon={<Percent className="h-3.5 w-3.5" />} onClick={onDiscount}>
              {l.lineDiscountType ? "Edit discount" : "Discount"}
            </Button>
          )}
          {canOverride && (
            <Button size="sm" variant="ghost" className="px-2.5 font-medium text-navy-700" icon={<Tag className="h-3.5 w-3.5" />} onClick={onOverride}>
              {overridden ? "Edit price" : "Change price"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="px-2.5 font-medium text-red-700 hover:bg-red-50"
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
    <li className="flex animate-[rise_320ms_var(--ease-out-quart)_both] flex-wrap items-center gap-x-4 gap-y-2 bg-paper/50 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="label-mono text-navy-500">Charge</span>
          <span className="text-sm font-semibold text-navy-950">{l.productName}</span>
        </div>
        {((taxCharged && D(l.gstRate).greaterThan(0)) || l.hsnCode) && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-navy-500">
            {taxCharged && D(l.gstRate).greaterThan(0) && <span>GST {D(l.gstRate).toString()}% {l.priceIncludesTax ? "incl." : "extra"}</span>}
            {l.hsnCode && <span className="font-mono">SAC {l.hsnCode}</span>}
          </div>
        )}
      </div>
      <div className="font-mono text-[15px] font-semibold text-navy-950 tabular">{formatINR(l.lineTotal)}</div>
      {editable && (
        <Button
          size="sm"
          variant="ghost"
          className="px-2.5 font-medium text-red-700 hover:bg-red-50"
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
          <Input id="ovr-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 font-mono text-lg font-semibold tabular" autoFocus />
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
          <Input id="chg-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono font-semibold tabular" autoFocus />
        </Field>
        <Field label="GST rate" htmlFor="chg-gst" hint="Confirm the applicable rate with your accountant">
          <Select id="chg-gst" value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
            <option value="0">0%</option>
            <option value="5">5%</option>
            <option value="18">18%</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-navy-200 bg-paper/60 p-1">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setIncl(v)}
                aria-pressed={incl === v}
                className={cn(
                  "h-9 rounded-md text-sm font-semibold transition-colors duration-150",
                  incl === v ? "bg-navy-900 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)]" : "text-navy-600 hover:bg-white hover:text-navy-900",
                )}
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
