"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ClipboardList, MessageCircle, Minus, Plus } from "lucide-react";
import type { PublicVariant } from "@/server/services/public-catalog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { formatINR } from "@/lib/money";
import { whatsappLink } from "@/lib/india";
import { PriceTag } from "./price";
import { useEnquiryList } from "./cart-store";

function clampQty(raw: string, decimals: number): string | null {
  const s = raw.trim();
  if (!s) return null;
  const re = decimals > 0 ? new RegExp(`^\\d{1,6}(\\.\\d{1,${decimals}})?$`) : /^\d{1,6}$/;
  if (!re.test(s)) return null;
  if (Number(s) <= 0) return null;
  return s;
}

export function ProductPurchase({
  productName,
  slug,
  variantAttributes,
  variants,
  whatsapp,
  enquiriesEnabled,
}: {
  productName: string;
  slug: string;
  variantAttributes: string[];
  variants: PublicVariant[];
  whatsapp: string | null;
  enquiriesEnabled: boolean;
}) {
  const toast = useToast();
  const list = useEnquiryList();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [qtyText, setQtyText] = useState("1");
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  const attrs = useMemo(
    () => variantAttributes.filter((a) => variants.length > 1 && variants.every((v) => v.attributes[a])),
    [variantAttributes, variants],
  );

  if (!selected) {
    return <p className="text-sm text-navy-500">This product is currently not available. Please contact us.</p>;
  }

  const decimals = selected.unitDecimals;
  const qty = clampQty(qtyText, decimals);
  const step = (dir: 1 | -1) => {
    const n = Math.max(decimals ? 10 ** -decimals : 1, (Number(qty ?? "1") || 1) + dir);
    setQtyText(String(Math.round(n * 10 ** decimals) / 10 ** decimals));
  };

  const pickAttr = (attr: string, value: string) => {
    const current = selected.attributes;
    const exact = variants.find((v) => attrs.every((a) => (a === attr ? v.attributes[a] === value : v.attributes[a] === current[a])));
    const loose = variants.find((v) => v.attributes[attr] === value);
    const next = exact ?? loose;
    if (next) setSelectedId(next.id);
  };

  const inList = list.items.some((i) => i.variantId === selected.id);
  const waText = `Hello OM ENTERPRISE, I'm interested in:\n${productName} — ${selected.name} (SKU ${selected.sku})\nQuantity: ${qty ?? qtyText} ${selected.unit}\nPlease share availability and price.`;

  const add = () => {
    if (!qty) {
      toast(decimals ? `Enter a quantity with up to ${decimals} decimal places` : "Enter a whole-number quantity", "error");
      return;
    }
    list.add({
      variantId: selected.id,
      quantity: qty,
      productName,
      variantName: selected.name,
      slug,
      unit: selected.unit,
      unitDecimals: decimals,
    });
    toast(
      <span>
        Added to your enquiry list.{" "}
        <Link href="/enquiry" className="font-bold underline">
          View list
        </Link>
      </span>,
    );
  };

  return (
    <div className="space-y-6">
      {attrs.length > 0 ? (
        attrs.map((attr) => {
          const values = [...new Set(variants.map((v) => v.attributes[attr]))];
          if (values.length === 1) {
            return (
              <div key={attr} className="text-xs font-bold uppercase tracking-[0.14em] text-navy-600">
                {attr}: <span className="normal-case tracking-normal text-navy-900">{values[0]}</span>
              </div>
            );
          }
          return (
            <fieldset key={attr}>
              <legend className="text-xs font-bold uppercase tracking-[0.14em] text-navy-600">
                {attr}: <span className="normal-case tracking-normal text-navy-900">{selected.attributes[attr]}</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {values.map((val) => {
                  const active = selected.attributes[attr] === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => pickAttr(attr, val)}
                      aria-pressed={active}
                      className={cn(
                        "min-h-10 rounded-xl border px-4 text-sm font-semibold transition-colors",
                        active ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-800 hover:border-gold-400",
                      )}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })
      ) : variants.length > 1 ? (
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-[0.14em] text-navy-600">Choose an option</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {variants.map((v) => {
              const active = v.id === selected.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                    active ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-800 hover:border-gold-400",
                  )}
                >
                  <span className="font-semibold">{v.name}</span>
                  {v.price && <span className={cn("tabular", active ? "text-gold-300" : "text-navy-500")}>{formatINR(v.price.amount)}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="rounded-2xl border border-navy-100 bg-navy-50/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-navy-700">{selected.name}</div>
            <div className="mt-0.5 text-xs text-navy-500">
              SKU {selected.sku} · per {selected.unit.toLowerCase()}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <PriceTag price={selected.price} size="lg" />
        </div>
        {selected.price && selected.price.tiers.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-navy-700">
            {selected.price.tiers.map((t) => (
              <li key={t.minQty} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" />
                <span>
                  <span className="font-bold tabular">{formatINR(t.amount)}</span> each for {Number(t.minQty)}+ {selected.unit.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="qty" className="block text-xs font-bold uppercase tracking-[0.14em] text-navy-600">
              Quantity ({selected.unit.toLowerCase()})
            </label>
            <div className="mt-1.5 flex h-12 items-center overflow-hidden rounded-xl border border-navy-200 bg-white">
              <button type="button" onClick={() => step(-1)} className="flex h-full w-11 items-center justify-center text-navy-700 hover:bg-navy-50" aria-label="Decrease quantity">
                <Minus className="h-4 w-4" />
              </button>
              <input
                id="qty"
                inputMode={decimals ? "decimal" : "numeric"}
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                aria-invalid={!qty}
                className="h-full w-20 border-x border-navy-100 text-center text-base font-bold tabular text-navy-900 focus:outline-none"
              />
              <button type="button" onClick={() => step(1)} className="flex h-full w-11 items-center justify-center text-navy-700 hover:bg-navy-50" aria-label="Increase quantity">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {enquiriesEnabled && (
            <button
              type="button"
              onClick={add}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 text-base font-bold text-white shadow-sm transition-colors hover:bg-navy-800 sm:flex-none"
            >
              <ClipboardList className="h-5 w-5" /> {inList ? "Add more to list" : "Add to enquiry list"}
            </button>
          )}
        </div>
        {!qty && <p className="mt-2 text-xs text-red-700">{decimals ? `Up to ${decimals} decimal places allowed.` : "Whole numbers only."}</p>}
        {whatsapp && (
          <a
            href={whatsappLink(whatsapp, waText)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-bold text-white hover:bg-emerald-700"
          >
            <MessageCircle className="h-5 w-5" /> Ask on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
