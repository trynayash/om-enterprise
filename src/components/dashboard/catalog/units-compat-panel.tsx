"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { SampleBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { CompatDTO, CompatVariantDTO, ConversionDTO, UnitOption, VariantRow } from "./types";
import { lineDescription } from "@/lib/line-description";

interface SearchHit {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  brandName: string | null;
  isSample: boolean;
}

export function UnitsCompatPanel({
  variant,
  productId,
  productName,
  siblings,
  conversions,
  compat,
  compatVariants,
  units,
  canEdit,
}: {
  variant: VariantRow;
  productId: string;
  productName: string;
  siblings: VariantRow[];
  conversions: ConversionDTO[];
  compat: CompatDTO[];
  compatVariants: CompatVariantDTO[];
  units: UnitOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const baseUnit = units.find((u) => u.code === variant.unitCode);
  const myConversions = conversions.filter((c) => c.variantId === variant.id);
  const [unitCode, setUnitCode] = useState("");
  const [factor, setFactor] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const links = compat
    .filter((c) => c.a === variant.id || c.b === variant.id)
    .map((c) => {
      const otherId = c.a === variant.id ? c.b : c.a;
      const sib = siblings.find((s) => s.id === otherId);
      const other = compatVariants.find((x) => x.id === otherId);
      return {
        otherId,
        note: c.note,
        label: sib ? lineDescription(null, productName, sib.name) : other ? lineDescription(null, other.productName, other.name) : otherId,
        sku: sib?.sku ?? other?.sku ?? "",
        productId: sib ? productId : (other?.productId ?? null),
      };
    });

  const addConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("conv");
    setError(null);
    try {
      await apiFetch(`/api/admin/variants/${variant.id}/conversions`, { method: "POST", body: { unitCode, factor: factor.trim() } });
      toast("Selling unit added");
      setUnitCode("");
      setFactor("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const removeConversion = async (id: string) => {
    if (!confirm("Stop allowing this unit for this variant?")) return;
    try {
      await apiFetch(`/api/admin/conversions/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // ---- compatibility search
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const [note, setNote] = useState("");
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      apiFetch<SearchHit[]>(`/api/admin/variants/search?q=${encodeURIComponent(term)}&limit=12`, { signal: ctrl.signal })
        .then((hits) => setResult({ q: term, hits }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);
  const hits = term.length >= 2 && result.q === term ? result.hits.filter((h) => h.variantId !== variant.id && !links.some((l) => l.otherId === h.variantId)) : [];

  const link = async (hit: SearchHit) => {
    setBusy(hit.variantId);
    setError(null);
    try {
      await apiFetch(`/api/admin/variants/${variant.id}/compatibility`, { method: "POST", body: { otherVariantId: hit.variantId, note: note.trim() || null } });
      toast(`Linked with ${hit.sku}`);
      setQ("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (otherId: string) => {
    if (!confirm("Remove this compatibility link?")) return;
    try {
      await apiFetch(`/api/admin/variants/${variant.id}/compatibility`, { method: "DELETE", body: { otherVariantId: otherId } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="label-caps text-navy-600">Other selling units</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-navy-500">
          Base unit: <b>{baseUnit?.name ?? variant.unitCode}</b>. Only units listed here can be used at the counter — nothing is converted automatically.
        </p>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        <ul className="mt-3 divide-y divide-navy-100 rounded-lg border border-navy-100 bg-white">
          {myConversions.length === 0 && <li className="px-3 py-3 text-sm text-navy-500">Sold only by {baseUnit?.name?.toLowerCase() ?? variant.unitCode}.</li>}
          {myConversions.map((c) => {
            const u = units.find((x) => x.code === c.unitCode);
            return (
              <li key={c.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span>
                  1 <b>{u?.name ?? c.unitCode}</b> = <span className="font-mono tabular">{Number(c.factor)}</span> {baseUnit?.name ?? variant.unitCode}
                </span>
                {canEdit && (
                  <Button size="sm" variant="ghost" aria-label="Remove unit" onClick={() => removeConversion(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <form onSubmit={addConversion} className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Also sell by" htmlFor="cv-unit" className="min-w-36 flex-1">
              <Select id="cv-unit" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} required>
                <option value="">Choose unit</option>
                {units
                  .filter((u) => u.code !== variant.unitCode && !myConversions.some((c) => c.unitCode === u.code))
                  .map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={`= how many ${baseUnit?.name ?? variant.unitCode}?`} htmlFor="cv-factor" className="w-40">
              <Input id="cv-factor" className="font-mono" inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="e.g. 10" required />
            </Field>
            <Button type="submit" variant="outline" loading={busy === "conv"} disabled={!unitCode || !/^\d{1,8}(\.\d{1,6})?$/.test(factor.trim()) || Number(factor) <= 0} icon={<Plus className="h-4 w-4" />}>
              Add
            </Button>
          </form>
        )}
      </section>

      <section>
        <h3 className="label-caps text-navy-600">Compatible items</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-navy-500">Link only items you know fit together (same system, size and class). Shown to staff and customers.</p>
        <ul className="mt-3 divide-y divide-navy-100 rounded-lg border border-navy-100 bg-white">
          {links.length === 0 && <li className="px-3 py-3 text-sm text-navy-500">No compatibility links.</li>}
          {links.map((l) => (
            <li key={l.otherId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-gold-600" />
                  {l.productId ? (
                    <Link href={`/dashboard/products/${l.productId}`} className="truncate hover:underline">
                      {l.label}
                    </Link>
                  ) : (
                    l.label
                  )}
                </span>
                <span className="block text-xs text-navy-500">
                  <span className="font-mono">{l.sku}</span>
                  {l.note ? ` · ${l.note}` : ""}
                </span>
              </span>
              {canEdit && (
                <Button size="sm" variant="ghost" aria-label="Remove link" onClick={() => unlink(l.otherId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
              <Input type="search" aria-label="Find an item to link" placeholder="Find item by name or SKU to link…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Input aria-label="Compatibility note" placeholder='Note (optional), e.g. "Same nominal size ¾"' value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            {hits.length > 0 && (
              <ul className="max-h-64 overflow-y-auto rounded-lg border border-navy-200 bg-white shadow-card">
                {hits.map((h) => (
                  <li key={h.variantId} className="flex items-center justify-between gap-2 border-b border-navy-100 px-3 py-2 text-sm last:border-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {lineDescription(null, h.productName, h.variantName)} {h.isSample && <SampleBadge className="ml-1" label="Sample" />}
                      </span>
                      <span className="text-xs text-navy-500">
                        <span className="font-mono">{h.sku}</span>
                        {h.brandName ? ` · ${h.brandName}` : ""}
                      </span>
                    </span>
                    <Button size="sm" variant="outline" loading={busy === h.variantId} onClick={() => link(h)}>
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
