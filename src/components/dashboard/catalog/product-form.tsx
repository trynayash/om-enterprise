"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { categoryTree, type CategoryOption, type Option, type ProductDetails, type TaxOption, type UnitOption } from "./types";

interface Props {
  mode: "create" | "edit";
  product?: ProductDetails;
  categories: CategoryOption[];
  brands: Option[];
  units: UnitOption[];
  taxClasses: TaxOption[];
  canEdit: boolean;
  /** Only the Super Admin may mark or unmark sample (training) data. */
  canMarkSample?: boolean;
  defaultCategoryId?: string;
}

type SpecRow = { label: string; value: string };

export function ProductForm({ mode, product, categories, brands, units, taxClasses, canEdit, canMarkSample = false, defaultCategoryId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const [f, setF] = useState({
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    brandId: product?.brandId ?? "",
    categoryId: product?.categoryId ?? defaultCategoryId ?? tree[0]?.id ?? "",
    manufacturer: product?.manufacturer ?? "",
    model: product?.model ?? "",
    description: product?.description ?? "",
    warrantyInfo: product?.warrantyInfo ?? "",
    hsnCode: product?.hsnCode ?? "",
    taxClassId: product?.taxClassId ?? taxClasses.find((t) => Number(t.gstRate) === 18)?.id ?? "",
    unitCode: product?.unitCode ?? "pcs",
    discountEligible: product?.discountEligible ?? true,
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    isSample: product?.isSample ?? false,
    sourceInfo: product?.sourceInfo ?? "",
  });
  const [specs, setSpecs] = useState<SpecRow[]>(product?.specifications?.length ? product.specifications : [{ label: "", value: "" }]);
  const [attrs, setAttrs] = useState<string[]>(product?.variantAttributes ?? []);
  const [attrDraft, setAttrDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = !canEdit;

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const addAttr = () => {
    const v = attrDraft.trim();
    if (v && !attrs.includes(v) && attrs.length < 6) setAttrs([...attrs, v]);
    setAttrDraft("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: f.name.trim(),
      ...(f.slug.trim() && (mode === "create" || f.slug.trim() !== product?.slug) ? { slug: f.slug.trim() } : {}),
      brandId: f.brandId || null,
      categoryId: f.categoryId,
      manufacturer: f.manufacturer,
      model: f.model,
      description: f.description,
      specifications: specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() })).filter((s) => s.label && s.value),
      variantAttributes: attrs,
      warrantyInfo: f.warrantyInfo,
      hsnCode: f.hsnCode.trim(),
      taxClassId: f.taxClassId || null,
      unitCode: f.unitCode,
      discountEligible: f.discountEligible,
      isActive: f.isActive,
      isFeatured: f.isFeatured,
      isSample: f.isSample,
      sourceInfo: f.sourceInfo,
    };
    try {
      if (mode === "create") {
        const created = await apiFetch<{ id: string }>("/api/admin/products", { method: "POST", body: payload });
        toast("Product created — now add its variants and prices");
        router.push(`/dashboard/products/${created.id}`);
      } else {
        const updated = await apiFetch<{ reviewStatus: string }>(`/api/admin/products/${product!.id}`, { method: "PATCH", body: payload });
        toast(
          updated.reviewStatus === "pending_review" && product?.reviewStatus === "approved"
            ? "Saved. Key details changed, so the product needs review again."
            : "Product details saved",
        );
        router.refresh();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const selectedTax = taxClasses.find((t) => t.id === f.taxClassId);

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader
          title="Product details"
          description={mode === "create" ? "Start with the basics. You'll add variants (sizes, colours, capacities), prices and images next." : "Information shown at the counter, on bills and on the website."}
        />
        <CardBody className="space-y-6">
          {error && <Alert tone="danger">{error}</Alert>}
          {readOnly && <Alert tone="info">You can view this product but not edit it.</Alert>}
          <fieldset disabled={readOnly || busy} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" htmlFor="p-name" required className="sm:col-span-2" hint="As customers know it, e.g. “Easy Clean Interior Emulsion”. Variants carry size/colour.">
                <Input id="p-name" value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={160} />
              </Field>
              <Field label="Brand" htmlFor="p-brand">
                <Select id="p-brand" value={f.brandId} onChange={(e) => set("brandId", e.target.value)}>
                  <option value="">— No brand —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category" htmlFor="p-cat" required>
                <Select id="p-cat" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
                  {tree.map((c) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(c.depth)}
                      {c.depth ? "↳ " : ""}
                      {c.name}
                      {c.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Manufacturer" htmlFor="p-mfr">
                <Input id="p-mfr" value={f.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} maxLength={120} />
              </Field>
              <Field label="Model" htmlFor="p-model">
                <Input id="p-model" value={f.model} onChange={(e) => set("model", e.target.value)} maxLength={80} />
              </Field>
              <Field label="Web address (slug)" htmlFor="p-slug" hint={mode === "create" ? "Leave blank to generate from the name." : "Changing it changes the product's website link."}>
                <Input id="p-slug" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="easy-clean-interior-emulsion" maxLength={80} />
              </Field>
              <Field label="Warranty" htmlFor="p-warranty" hint="Only as stated by the manufacturer.">
                <Input id="p-warranty" value={f.warrantyInfo} onChange={(e) => set("warrantyInfo", e.target.value)} maxLength={500} />
              </Field>
            </div>

            <Field label="Description" htmlFor="p-desc">
              <Textarea id="p-desc" rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />
            </Field>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-navy-700">Technical specifications</span>
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSpecs([...specs, { label: "", value: "" }])}>
                  Add row
                </Button>
              </div>
              <p className="mb-2 text-xs text-navy-500">Copy from the official data sheet — never guess specifications.</p>
              <div className="space-y-2">
                {specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 border-b border-navy-50 pb-2 sm:grid-cols-[1fr_2fr_auto] sm:border-0 sm:pb-0">
                    <Input aria-label={`Specification ${i + 1} name`} placeholder="e.g. Coverage" value={s.label} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={60} />
                    <Input
                      aria-label={`Specification ${i + 1} value`}
                      placeholder="Value from the data sheet"
                      value={s.value}
                      onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      maxLength={300}
                      className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                    />
                    <Button variant="ghost" size="md" className="col-start-2 row-start-1 sm:col-start-auto" aria-label="Remove row" onClick={() => setSpecs(specs.length > 1 ? specs.filter((_, j) => j !== i) : [{ label: "", value: "" }])}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy-700">Variant attributes</span>
              <p className="mb-2 text-xs text-navy-500">What makes each variant different, e.g. Colour, Pack size, Capacity, Diameter, Class.</p>
              <div className="flex flex-wrap items-center gap-2">
                {attrs.map((a) => (
                  <span key={a} className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-3 py-1 text-sm font-medium text-navy-800">
                    {a}
                    <button type="button" aria-label={`Remove ${a}`} onClick={() => setAttrs(attrs.filter((x) => x !== a))} className="rounded-full p-0.5 hover:bg-navy-200">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {attrs.length < 6 && (
                  <div className="flex gap-2">
                    <Input
                      aria-label="New attribute name"
                      value={attrDraft}
                      onChange={(e) => setAttrDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAttr();
                        }
                      }}
                      placeholder="Add attribute"
                      className="h-8 w-40"
                      maxLength={40}
                    />
                    <Button size="sm" variant="outline" onClick={addAttr} disabled={!attrDraft.trim()}>
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="HSN code" htmlFor="p-hsn" hint="4–8 digits. Needed on tax invoices to registered buyers.">
                <Input id="p-hsn" inputMode="numeric" value={f.hsnCode} onChange={(e) => set("hsnCode", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="e.g. 3209" />
              </Field>
              <Field label="GST class" htmlFor="p-tax" hint={selectedTax?.isExempt ? "Exempt / nil-rated: no GST charged." : "Confirm the rate for this HSN with your accountant."}>
                <Select id="p-tax" value={f.taxClassId} onChange={(e) => set("taxClassId", e.target.value)}>
                  <option value="">— Not set —</option>
                  {taxClasses
                    .filter((t) => t.isActive || t.id === f.taxClassId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Selling unit" htmlFor="p-unit" hint="Default unit for new variants.">
                <Select id="p-unit" value={f.unitCode} onChange={(e) => set("unitCode", e.target.value)}>
                  {units.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 rounded-xl border border-navy-100 bg-navy-50/40 p-4 sm:grid-cols-2">
              <Checkbox checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} label={<><b>Active</b> — can be sold at the counter</>} />
              <Checkbox checked={f.discountEligible} onChange={(e) => set("discountEligible", e.target.checked)} label={<><b>Discounts allowed</b> on this product</>} />
              <Checkbox checked={f.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} label={<><b>Featured</b> on the website home page</>} />
              <Checkbox
                checked={f.isSample}
                disabled={!canMarkSample}
                onChange={(e) => set("isSample", e.target.checked)}
                label={
                  <>
                    <b className="text-red-700">Sample / demonstration data</b>
                    <span className="block text-xs text-navy-500">
                      Shown with a SAMPLE badge. Sales of it are training sales (TRN numbering, watermarked, excluded from reports) and can&apos;t include real items.
                      {!canMarkSample && " Only the Super Admin can change this."}
                    </span>
                  </>
                }
              />
            </div>

            <Field label="Information source" htmlFor="p-source" hint="Where this data came from (catalogue page, data sheet, supplier price list). Helps reviewers verify it.">
              <Input id="p-source" value={f.sourceInfo} onChange={(e) => set("sourceInfo", e.target.value)} maxLength={500} placeholder="e.g. Berger price list Apr 2026, p.4" />
            </Field>
          </fieldset>
          {!readOnly && (
            <div className="flex justify-end gap-2 border-t border-navy-100 pt-4">
              {mode === "create" && (
                <Button variant="ghost" onClick={() => router.push("/dashboard/products")}>
                  Cancel
                </Button>
              )}
              <Button type="submit" loading={busy} disabled={!f.name.trim() || !f.categoryId}>
                {mode === "create" ? "Create product" : "Save details"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </form>
  );
}
