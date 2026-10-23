"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { TaxOption, UnitOption, VariantRow } from "./types";

export function VariantDialog({
  open,
  onClose,
  productId,
  variant,
  variantAttributes,
  defaultUnit,
  units,
  taxClasses,
  canConfigureMargins,
  nextSortOrder,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  variant: VariantRow | null;
  variantAttributes: string[];
  defaultUnit: string;
  units: UnitOption[];
  taxClasses: TaxOption[];
  canConfigureMargins: boolean;
  nextSortOrder: number;
  onSaved?: (id: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={variant ? `Edit variant ${variant.sku}` : "Add variant"} description="Each sellable size / colour / capacity is a variant with its own SKU, price and (later) stock." size="lg">
      {open && (
        <VariantForm
          key={variant?.id ?? "new"}
          productId={productId}
          variant={variant}
          variantAttributes={variantAttributes}
          defaultUnit={defaultUnit}
          units={units}
          taxClasses={taxClasses}
          canConfigureMargins={canConfigureMargins}
          nextSortOrder={nextSortOrder}
          onDone={(id) => {
            onSaved?.(id);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    </Dialog>
  );
}

function VariantForm({
  productId,
  variant,
  variantAttributes,
  defaultUnit,
  units,
  taxClasses,
  canConfigureMargins,
  nextSortOrder,
  onDone,
  onCancel,
}: {
  productId: string;
  variant: VariantRow | null;
  variantAttributes: string[];
  defaultUnit: string;
  units: UnitOption[];
  taxClasses: TaxOption[];
  canConfigureMargins: boolean;
  nextSortOrder: number;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const attrNames = [...new Set([...variantAttributes, ...Object.keys(variant?.attributes ?? {})])];
  const [f, setF] = useState({
    sku: variant?.sku ?? "",
    barcode: variant?.barcode ?? "",
    name: variant?.name ?? "",
    unitCode: variant?.unitCode ?? defaultUnit,
    taxClassId: variant?.taxClassId ?? "",
    discountEligible: variant?.discountEligible === null || variant?.discountEligible === undefined ? "inherit" : variant.discountEligible ? "yes" : "no",
    targetMarginPercent: variant?.targetMarginPercent ? String(Number(variant.targetMarginPercent)) : "",
    minMarginPercent: variant?.minMarginPercent ? String(Number(variant.minMarginPercent)) : "",
    isActive: variant?.isActive ?? true,
    sortOrder: String(variant?.sortOrder ?? nextSortOrder),
  });
  const [attrs, setAttrs] = useState<Record<string, string>>(() => Object.fromEntries(attrNames.map((a) => [a, variant?.attributes?.[a] ?? ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  // Suggest a name from attribute values ("White · 10 L")
  const suggestedName = attrNames.map((a) => attrs[a]?.trim()).filter(Boolean).join(" · ");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const attributes = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const body: Record<string, unknown> = {
      sku: f.sku.trim(),
      barcode: f.barcode.trim(),
      name: (f.name.trim() || suggestedName).slice(0, 120),
      attributes,
      unitCode: f.unitCode,
      taxClassId: f.taxClassId || null,
      discountEligible: f.discountEligible === "inherit" ? null : f.discountEligible === "yes",
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder) || 0,
    };
    if (canConfigureMargins) {
      body.targetMarginPercent = f.targetMarginPercent.trim() || null;
      body.minMarginPercent = f.minMarginPercent.trim() || null;
    }
    try {
      const row = variant
        ? await apiFetch<{ id: string }>(`/api/admin/variants/${variant.id}`, { method: "PATCH", body })
        : await apiFetch<{ id: string }>(`/api/admin/products/${productId}/variants`, { method: "POST", body });
      toast(variant ? "Variant saved" : "Variant added — now set its price");
      router.refresh();
      onDone(row.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {attrNames.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {attrNames.map((a) => (
            <Field key={a} label={a} htmlFor={`attr-${a}`}>
              <Input id={`attr-${a}`} value={attrs[a] ?? ""} onChange={(e) => setAttrs({ ...attrs, [a]: e.target.value })} maxLength={80} />
            </Field>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Variant name" htmlFor="v-name" required hint={suggestedName && !f.name ? `Will use “${suggestedName}”` : "Shown on bills after the product name."}>
          <Input id="v-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={suggestedName || "e.g. White · 10 L"} maxLength={120} />
        </Field>
        <Field label="SKU" htmlFor="v-sku" required hint={variant ? "Can't change once used on a bill." : "Unique code, e.g. BER-EC-WH-10L"}>
          <Input id="v-sku" className="font-mono" value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} required maxLength={40} />
        </Field>
        <Field label="Barcode" htmlFor="v-barcode" hint="Optional — EAN/UPC printed on the pack.">
          <Input id="v-barcode" className="font-mono" value={f.barcode} onChange={(e) => set("barcode", e.target.value)} maxLength={32} inputMode="numeric" />
        </Field>
        <Field label="Selling unit" htmlFor="v-unit">
          <Select id="v-unit" value={f.unitCode} onChange={(e) => set("unitCode", e.target.value)}>
            {units.map((u) => (
              <option key={u.code} value={u.code}>
                {u.name} ({u.code}){u.decimals ? ` · up to ${u.decimals} decimals` : " · whole numbers"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="GST class override" htmlFor="v-tax" hint="Leave as product default unless this variant differs.">
          <Select id="v-tax" value={f.taxClassId} onChange={(e) => set("taxClassId", e.target.value)}>
            <option value="">Same as product</option>
            {taxClasses.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Discounts" htmlFor="v-disc">
          <Select id="v-disc" value={f.discountEligible} onChange={(e) => set("discountEligible", e.target.value)}>
            <option value="inherit">Same as product</option>
            <option value="yes">Allowed</option>
            <option value="no">Not allowed</option>
          </Select>
        </Field>
        {canConfigureMargins && (
          <>
            <Field label="Target gross margin %" htmlFor="v-target" hint="Used to suggest prices. Blank = category/global default.">
              <Input id="v-target" inputMode="decimal" value={f.targetMarginPercent} onChange={(e) => set("targetMarginPercent", e.target.value)} placeholder="e.g. 22" />
            </Field>
            <Field label="Minimum gross margin %" htmlFor="v-min" hint="Sales below this need approval. Blank = default.">
              <Input id="v-min" inputMode="decimal" value={f.minMarginPercent} onChange={(e) => set("minMarginPercent", e.target.value)} placeholder="e.g. 8" />
            </Field>
          </>
        )}
        <Field label="Display order" htmlFor="v-sort">
          <Input id="v-sort" type="number" min={0} max={10000} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} label="Active (can be sold)" />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-navy-100 pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={!f.sku.trim() || !(f.name.trim() || suggestedName)}>
          {variant ? "Save variant" : "Add variant"}
        </Button>
      </div>
    </form>
  );
}
