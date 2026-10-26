"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, Clock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { DateTime } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { D, formatINR, m } from "@/lib/money";
import { priceForTargetMargin } from "@/lib/pricing/engine";
import { marginInfo, type CatalogPermissions, type PriceListOption, type PriceVersionDTO, type PricingContextDTO, type RegType, type VariantRow } from "./types";

const PRICE_RE = /^\d{1,10}(\.\d{1,2})?$/;

export function PricePanel({
  variant,
  ctx,
  priceLists,
  current,
  pending,
  scheduled,
  landedCost,
  regType,
  defaultIncludesTax,
  perms,
  unitName,
}: {
  variant: VariantRow;
  ctx: PricingContextDTO;
  priceLists: PriceListOption[];
  /** Active version per price list id. */
  current: Record<string, PriceVersionDTO | undefined>;
  pending: PriceVersionDTO[];
  scheduled: PriceVersionDTO[];
  landedCost: string | null;
  regType: RegType;
  defaultIncludesTax: boolean;
  perms: CatalogPermissions;
  unitName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const lists = useMemo(() => [...priceLists].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)), [priceLists]);
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const list = lists.find((l) => l.id === listId);
  const cur = current[listId];
  const taxLabel = regType === "regular" ? "GST" : "tax";

  // ---- form state
  const [price, setPrice] = useState("");
  const [incl, setIncl] = useState<boolean>(cur?.priceIncludesTax ?? defaultIncludesTax);
  const [mrp, setMrp] = useState(cur?.mrp ?? "");
  const [tiers, setTiers] = useState<{ minQty: string; price: string }[]>(cur?.tiers ?? []);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState(ctx.targetMarginPercent ? String(Number(ctx.targetMarginPercent)) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const switchList = (id: string) => {
    setListId(id);
    const v = current[id];
    setPrice("");
    setIncl(v?.priceIncludesTax ?? defaultIncludesTax);
    setMrp(v?.mrp ?? "");
    setTiers(v?.tiers ?? []);
    setError(null);
  };

  const showCost = perms.canSeeCosts;
  const curInfo = cur ? marginInfo(cur.price, cur.priceIncludesTax, ctx, showCost ? landedCost : null, regType) : null;
  const draftValid = PRICE_RE.test(price.trim());
  const draftInfo = draftValid ? marginInfo(price.trim(), incl, ctx, showCost ? landedCost : null, regType) : null;
  const inclusive = (excl: ReturnType<typeof D>) => (regType === "regular" ? excl.times(D(100).plus(D(ctx.gstRate)).plus(D(ctx.cessRate))).div(100) : excl);

  let suggestion: { exclusive: string; charge: string } | null = null;
  if (showCost && landedCost && /^\d{1,2}(\.\d{1,2})?$/.test(target.trim()) && Number(target) < 100) {
    const excl = priceForTargetMargin(landedCost, target.trim());
    suggestion = { exclusive: m(excl), charge: m(incl ? inclusive(excl) : excl) };
  }
  const mrpWarning = draftValid && mrp && PRICE_RE.test(mrp) && D(incl ? price : inclusive(D(price))).greaterThan(D(mrp));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const effectiveFrom = when === "later" && effectiveAt ? new Date(effectiveAt).toISOString() : null;
      const res = await apiFetch<PriceVersionDTO>("/api/admin/prices", {
        method: "POST",
        body: {
          variantId: variant.id,
          priceListId: listId,
          price: price.trim(),
          priceIncludesTax: incl,
          mrp: mrp.trim() || null,
          tiers: tiers.filter((t) => t.minQty.trim() && t.price.trim()),
          effectiveFrom,
          reason: reason.trim(),
        },
      });
      toast(
        res.status === "pending"
          ? "Price change sent for approval — the current price stays until it is approved"
          : effectiveFrom
            ? "New price scheduled"
            : "New price is live",
        res.status === "pending" ? "info" : "success",
      );
      setPrice("");
      setReason("");
      setWhen("now");
      setEffectiveAt("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const decide = async (v: PriceVersionDTO, decision: "approve" | "reject") => {
    const note = decision === "reject" ? prompt("Reason for rejecting this price change?") : prompt("Optional note for this approval", "") ?? "";
    if (decision === "reject" && !note) return;
    setBusy(v.id);
    try {
      await apiFetch(`/api/admin/prices/${v.id}/decision`, { method: "POST", body: { decision, note: note || null } });
      toast(decision === "approve" ? "Price change approved" : "Price change rejected");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (v: PriceVersionDTO) => {
    const why = prompt("Why cancel this scheduled price?");
    if (!why || why.trim().length < 3) return;
    setBusy(v.id);
    try {
      await apiFetch(`/api/admin/prices/${v.id}/cancel`, { method: "POST", body: { reason: why.trim() } });
      toast("Scheduled price cancelled");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const listPending = pending.filter((p) => p.priceListId === listId);
  const listScheduled = scheduled.filter((p) => p.priceListId === listId);

  return (
    <div className="space-y-5">
      {lists.length > 1 && (
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-navy-200 bg-navy-50/60 p-0.5" role="tablist" aria-label="Price list">
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={l.id === listId}
              onClick={() => switchList(l.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                l.id === listId ? "bg-white text-navy-950 shadow-card" : "text-navy-500 hover:text-navy-900",
              )}
            >
              {l.name}
              {l.isDefault && <span className="ml-1.5 text-xs font-normal text-navy-500">(default)</span>}
              {!l.isActive && <span className="ml-1.5 text-xs font-normal text-navy-400">(not in use)</span>}
            </button>
          ))}
        </div>
      )}
      {list && !list.isActive && <Alert tone="info">The {list.name} price list isn&apos;t in use yet. Prices saved here are kept for when it is switched on.</Alert>}

      {/* Current price */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile label={`Current ${list?.name ?? ""} price`}>
          {cur ? (
            <>
              <div className="headline text-[1.5rem] font-bold tabular">{formatINR(cur.price)}</div>
              <div className="text-xs text-navy-500">
                per {unitName} · {cur.priceIncludesTax ? `incl. ${taxLabel}` : `excl. ${taxLabel}`}
                {cur.mrp ? ` · MRP ${formatINR(cur.mrp)}` : ""}
              </div>
              <div className="mt-1 text-xs text-navy-500">
                since <DateTime value={cur.effectiveFrom} />
              </div>
            </>
          ) : (
            <div className="text-sm font-semibold text-red-700">No price set — this variant can&apos;t be sold yet.</div>
          )}
        </InfoTile>
        <InfoTile label={regType === "regular" ? "Excl. GST (revenue)" : "Revenue per unit"}>
          {curInfo ? (
            <>
              <div className="headline text-xl font-bold tabular">{formatINR(curInfo.exclusive)}</div>
              <div className="text-xs text-navy-500">
                {regType === "regular"
                  ? `GST ${Number(ctx.gstRate)}%${Number(ctx.cessRate) ? ` + cess ${Number(ctx.cessRate)}%` : ""}`
                  : regType === null
                    ? "GST registration not confirmed yet — full price counted as revenue"
                    : "No GST collected (composition / unregistered)"}
              </div>
            </>
          ) : (
            <span className="text-navy-400">—</span>
          )}
        </InfoTile>
        {showCost && (
          <>
            <InfoTile label="Landed cost">
              {landedCost ? <div className="headline text-xl font-bold tabular">{formatINR(landedCost)}</div> : <div className="text-sm font-medium text-amber-700">Unknown — record a cost</div>}
            </InfoTile>
            <InfoTile label="Gross margin · markup">
              {curInfo?.margin ? (
                <>
                  <div className={cn("headline text-xl font-bold tabular", curInfo.belowCost ? "text-red-700" : curInfo.belowFloor ? "text-amber-700" : "text-emerald-700")}>{curInfo.margin.toFixed(1)}%</div>
                  <div className="text-xs text-navy-500">markup {curInfo.markup?.toFixed(1) ?? "—"}% on cost</div>
                </>
              ) : (
                <span className="text-navy-400">—</span>
              )}
            </InfoTile>
          </>
        )}
      </div>
      {cur && cur.tiers.length > 0 && (
        <div className="text-sm text-navy-700">
          <span className="label-caps mr-2 text-navy-500">Quantity breaks</span>
          {cur.tiers.map((t) => `${t.minQty}+ ${unitName} @ ${formatINR(t.price)}`).join(" · ")}
        </div>
      )}
      {curInfo?.belowCost && <Alert tone="danger" title="Selling below cost">The current price is lower than the landed cost.</Alert>}
      {!curInfo?.belowCost && curInfo?.belowFloor && <Alert tone="warning" title="Below minimum margin">The current margin is under the {Number(ctx.minMarginPercent)}% floor.</Alert>}

      {/* Pending & scheduled */}
      {(listPending.length > 0 || listScheduled.length > 0) && (
        <div className="space-y-2">
          {listPending.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="text-sm">
                <div className="flex items-center gap-2 font-semibold text-amber-900">
                  <Clock className="h-4 w-4" /> Awaiting approval: {v.previousPrice ? `${formatINR(v.previousPrice)} → ` : ""}
                  {formatINR(v.price)} {v.priceIncludesTax ? `incl. ${taxLabel}` : `excl. ${taxLabel}`}
                </div>
                <div className="text-xs text-amber-800">
                  “{v.reason}” · requested <DateTime value={v.createdAt} />
                  {showCost && v.marginPercentSnapshot ? ` · margin would be ${Number(v.marginPercentSnapshot).toFixed(1)}%` : ""}
                </div>
              </div>
              {perms.canApprovePrices && (
                <div className="flex gap-2">
                  <Button size="sm" variant="success" loading={busy === v.id} icon={<Check className="h-3.5 w-3.5" />} onClick={() => decide(v, "approve")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === v.id} icon={<X className="h-3.5 w-3.5" />} onClick={() => decide(v, "reject")}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
          {listScheduled.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-navy-200 bg-navy-50/70 px-4 py-3">
              <div className="text-sm">
                <div className="flex items-center gap-2 font-semibold text-navy-900">
                  <CalendarClock className="h-4 w-4" /> Scheduled: {formatINR(v.price)} from <DateTime value={v.effectiveFrom} />
                </div>
                <div className="text-xs text-navy-600">“{v.reason}”</div>
              </div>
              {perms.canApprovePrices && (
                <Button size="sm" variant="outline" loading={busy === v.id} onClick={() => cancel(v)}>
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New price form */}
      {perms.canEditPrices ? (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-rule bg-paper/50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <h3 className="text-[15px] font-semibold text-navy-900">Set a new {list?.name.toLowerCase()} price</h3>
            {!perms.canApprovePrices && <Badge tone="amber">Your changes need the Super Admin&apos;s approval</Badge>}
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Selling price per ${unitName}`} htmlFor="np-price" required>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-navy-400">₹</span>
                <Input id="np-price" inputMode="decimal" className="pl-7 font-mono tabular" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={cur?.price ?? "0.00"} required />
              </div>
            </Field>
            <Field label="Price basis" htmlFor="np-incl">
              <Select id="np-incl" value={incl ? "incl" : "excl"} onChange={(e) => setIncl(e.target.value === "incl")}>
                <option value="incl">Incl. GST</option>
                <option value="excl">Excl. GST (+ at billing)</option>
              </Select>
            </Field>
            <Field label="MRP (optional)" htmlFor="np-mrp" hint="Selling price can't exceed MRP.">
              <Input id="np-mrp" inputMode="decimal" className="font-mono tabular" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="As printed on pack" />
            </Field>
          </div>

          {draftInfo && (
            <div
              className={cn(
                "grid gap-2 rounded-lg border px-3 py-2.5 text-sm sm:grid-cols-3",
                draftInfo.belowCost ? "border-red-200 bg-red-50 text-red-900" : draftInfo.belowFloor ? "border-amber-200 bg-amber-50 text-amber-900" : "border-navy-100 bg-white text-navy-800",
              )}
            >
              <div>
                {regType === "regular" ? "Excl. GST" : "Revenue"}: <b className="tabular">{formatINR(draftInfo.exclusive)}</b>
                {regType === "regular" && !incl && (
                  <span className="text-navy-500"> · customer pays {formatINR(inclusive(D(price)))}</span>
                )}
              </div>
              {showCost && (
                <>
                  <div>
                    Gross margin: <b className="tabular">{draftInfo.margin ? `${draftInfo.margin.toFixed(1)}%` : "—"}</b>
                    {draftInfo.markup && <span className="text-navy-500"> (markup {draftInfo.markup.toFixed(1)}%)</span>}
                  </div>
                  <div className="font-semibold">
                    {draftInfo.belowCost ? (
                      <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Below cost</span>
                    ) : draftInfo.belowFloor ? (
                      <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Below {Number(ctx.minMarginPercent)}% floor</span>
                    ) : landedCost ? (
                      "Margin OK"
                    ) : (
                      "Cost unknown"
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {mrpWarning && <Alert tone="danger">This price is above the MRP — it will be rejected.</Alert>}

          {showCost && landedCost && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-navy-100 bg-white px-3 py-3">
              <Field label="Target gross margin %" htmlFor="np-target" className="w-48">
                <Input id="np-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 20" className="font-mono" />
              </Field>
              <div className="min-w-0 flex-1 pb-2.5 text-sm text-navy-700">
                {suggestion ? (
                  <>
                    Suggested: <b className="tabular">{formatINR(suggestion.charge)}</b> {incl ? `incl. ${taxLabel}` : `excl. ${taxLabel}`}
                    <span className="text-navy-500"> (= cost ÷ (1 − {Number(target)}%) = {formatINR(suggestion.exclusive)} {regType === "regular" ? "excl. GST" : ""})</span>
                  </>
                ) : (
                  <span className="text-navy-500">Enter a margin below 100% to get a suggested price.</span>
                )}
              </div>
              {suggestion && (
                <Button size="sm" variant="outline" className="mb-1" onClick={() => setPrice(suggestion.charge)}>
                  Use
                </Button>
              )}
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label-caps text-navy-600">Quantity breaks (optional)</span>
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTiers([...tiers, { minQty: "", price: "" }])} disabled={tiers.length >= 10}>
                Add break
              </Button>
            </div>
            {tiers.length === 0 ? (
              <p className="text-xs text-navy-500">E.g. 10+ pieces at a lower unit price. Same tax basis as the main price.</p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-24 shrink-0">
                      <Input aria-label="Minimum quantity" inputMode="decimal" className="font-mono" value={t.minQty} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))} placeholder="10" />
                    </div>
                    <span className="text-navy-500">{unitName} or more at ₹</span>
                    <div className="w-32 shrink-0">
                      <Input aria-label="Tier price" inputMode="decimal" className="font-mono tabular" value={t.price} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder="0.00" />
                    </div>
                    <Button variant="ghost" size="sm" aria-label="Remove break" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Takes effect" htmlFor="np-when">
              <Select id="np-when" value={when} onChange={(e) => setWhen(e.target.value as "now" | "later")}>
                <option value="now">Immediately{!perms.canApprovePrices ? " (once approved)" : ""}</option>
                <option value="later">From a future date & time</option>
              </Select>
            </Field>
            {when === "later" && (
              <Field label="Effective from" htmlFor="np-at" required>
                <Input id="np-at" type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} required />
              </Field>
            )}
          </div>
          <Field label="Reason for the change" htmlFor="np-reason" required hint="Recorded in price history, e.g. “Supplier price list Apr 2026” or “Festive offer”.">
            <Textarea id="np-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required minLength={3} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={busy === "save"} disabled={!draftValid || reason.trim().length < 3 || (when === "later" && !effectiveAt)}>
              {perms.canApprovePrices ? "Save price" : "Submit for approval"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-navy-500">You can view prices but not change them.</p>
      )}
    </div>
  );
}

function InfoTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-navy-100 bg-white px-4 py-3">
      <div className="label-caps mb-1.5 text-navy-500">{label}</div>
      {children}
    </div>
  );
}
