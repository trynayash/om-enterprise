"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Minus, Plus, Trash2 } from "lucide-react";
import { SampleBadge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { useEnquiryList } from "./cart-store";
import { EnquiryForm, EnquirySuccess, type EnquiryDone } from "./enquiry-form";

interface PricedLine {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  unit: string;
  quantity: string;
  unitPrice: string | null;
  lineTotal: string | null;
  isSample: boolean;
}
interface Priced {
  lines: PricedLine[];
  total: string;
  allPriced: boolean;
}

function validQty(s: string, decimals: number) {
  const re = decimals > 0 ? new RegExp(`^\\d{1,6}(\\.\\d{1,${decimals}})?$`) : /^\d{1,6}$/;
  return re.test(s) && Number(s) > 0;
}

export function EnquiryList({ whatsapp, priceNote, enquiriesEnabled }: { whatsapp: string | null; priceNote: string; enquiriesEnabled: boolean }) {
  const list = useEnquiryList();
  const [pricedState, setPriced] = useState<Priced | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<EnquiryDone | null>(null);

  const validItems = useMemo(
    () => list.items.filter((i) => validQty(i.quantity, i.unitDecimals ?? 0)).map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    [list.items],
  );
  const key = JSON.stringify(validItems);
  const priced = validItems.length ? pricedState : null;

  useEffect(() => {
    if (!validItems.length) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      apiFetch<Priced>("/api/public/cart", { method: "POST", body: { items: validItems }, signal: ctrl.signal })
        .then(setPriced)
        .catch(() => {
          if (!ctrl.signal.aborted) setPriced(null);
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-price only when the item list actually changes
  }, [key]);

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl">
        <EnquirySuccess done={submitted} whatsapp={whatsapp} />
      </div>
    );
  }

  const lineFor = (variantId: string) => priced?.lines.find((l) => l.variantId === variantId);
  const unavailable = priced ? list.items.filter((i) => !lineFor(i.variantId)) : [];
  const commit = (variantId: string, decimals: number) => {
    const v = drafts[variantId];
    if (v !== undefined && validQty(v, decimals)) list.setQuantity(variantId, v);
    setDrafts((d) => {
      const next = { ...d };
      delete next[variantId];
      return next;
    });
  };
  const bump = (variantId: string, current: string, decimals: number, dir: 1 | -1) => {
    const n = Math.round((Number(current) + dir) * 10 ** decimals) / 10 ** decimals;
    if (n > 0) list.setQuantity(variantId, String(n));
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
          <ClipboardList className="h-5 w-5 text-gold-600" /> Your enquiry list
          {list.count > 0 && <span className="text-sm font-semibold text-navy-500">({list.count})</span>}
        </h2>
        {list.items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-navy-200 bg-navy-50/50 p-8 text-center">
            <p className="font-semibold text-navy-900">Your list is empty</p>
            <p className="mt-1 text-sm text-navy-500">Add products from the catalogue, or just tell us what you need using the form.</p>
            <Link href="/products" className="mt-4 inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
              Browse products
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-navy-100 overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
              {list.items.map((item) => {
                const line = lineFor(item.variantId);
                const decimals = item.unitDecimals ?? 0;
                const draft = drafts[item.variantId];
                return (
                  <li key={item.variantId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link href={`/products/${item.slug}`} className="font-bold text-navy-900 hover:underline">
                        {line?.productName ?? item.productName}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-navy-500">
                        <span>{line?.variantName ?? item.variantName}</span>
                        {line?.isSample && <SampleBadge />}
                      </div>
                      <div className="mt-1 text-sm tabular text-navy-700">
                        {line?.unitPrice ? (
                          <>
                            {formatINR(line.unitPrice)} <span className="text-navy-400">/ {item.unit.toLowerCase()}</span>
                          </>
                        ) : priced && !line ? (
                          <span className="text-red-700">No longer available online</span>
                        ) : priced ? (
                          <span className="text-navy-500">Price on request</span>
                        ) : (
                          <span className="inline-block h-4 w-20 animate-pulse rounded bg-navy-100" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="flex h-10 items-center overflow-hidden rounded-xl border border-navy-200">
                        <button type="button" onClick={() => bump(item.variantId, item.quantity, decimals, -1)} className="flex h-full w-9 items-center justify-center hover:bg-navy-50" aria-label={`Decrease quantity of ${item.productName}`}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          value={draft ?? item.quantity}
                          inputMode={decimals ? "decimal" : "numeric"}
                          aria-label={`Quantity of ${item.productName} (${item.unit})`}
                          onChange={(e) => setDrafts((d) => ({ ...d, [item.variantId]: e.target.value }))}
                          onBlur={() => commit(item.variantId, decimals)}
                          onKeyDown={(e) => e.key === "Enter" && commit(item.variantId, decimals)}
                          className="h-full w-16 border-x border-navy-100 text-center text-sm font-bold tabular focus:outline-none"
                        />
                        <button type="button" onClick={() => bump(item.variantId, item.quantity, decimals, 1)} className="flex h-full w-9 items-center justify-center hover:bg-navy-50" aria-label={`Increase quantity of ${item.productName}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="w-28 text-right text-sm font-extrabold tabular text-navy-900">{line?.lineTotal ? formatINR(line.lineTotal) : "—"}</div>
                      <button type="button" onClick={() => list.remove(item.variantId)} className="rounded-lg p-2 text-navy-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${item.productName}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {unavailable.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {unavailable.length === 1 ? "One item is" : `${unavailable.length} items are`} no longer listed online. Remove {unavailable.length === 1 ? "it" : "them"} before sending, or ask us about it in the message.
                </span>
              </div>
            )}
            <div className="mt-4 rounded-2xl bg-navy-900 p-5 text-white">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-navy-200">Indicative total</span>
                <span className="text-2xl font-extrabold tabular">{loading && !priced ? "…" : priced ? formatINR(priced.total) : "—"}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-navy-300">
                {priced && !priced.allPriced ? "Some items are priced on request and are not included. " : ""}
                {priceNote || "Prices are confirmed when we prepare your bill."} Final amount, availability and any delivery charges are confirmed by the shop.
              </p>
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="form-heading" className="rounded-3xl border border-navy-100 bg-white p-5 shadow-card sm:p-7 lg:self-start">
        <h2 id="form-heading" className="text-lg font-extrabold text-navy-900">
          {list.items.length ? "Send your list to the shop" : "Tell us what you need"}
        </h2>
        <p className="mt-1 text-sm text-navy-500">We&apos;ll call or WhatsApp you to confirm. Nothing is charged online.</p>
        <div className="mt-5">
          {enquiriesEnabled ? (
            <EnquiryForm
              items={unavailable.length ? validItems.filter((i) => lineFor(i.variantId)) : validItems}
              whatsapp={whatsapp}
              allowOrderRequest
              onSubmitted={(done) => {
                list.clear();
                setSubmitted(done);
              }}
            />
          ) : (
            <div className="rounded-xl bg-navy-50 p-4 text-sm text-navy-700">
              Online enquiries are paused right now. Please call or WhatsApp us — we&apos;re happy to help.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
