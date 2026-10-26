"use client";
import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { Alert } from "@/components/ui/page";
import { tdCode, tdNum, tdText, th, thNum } from "@/components/dashboard/table";
import { cn } from "@/components/ui/cn";
import type { ImportTable } from "@/lib/import-files";
import { buildImportRows, detectHeaderRow, guessColumns, norm, suspectPrices, type ImportRow, type MappingSettings, type SourceField } from "@/lib/import-files/mapping";

/**
 * Step 2 of an import from a supplier's own file: pick the table and its header row, say which
 * column holds what, fill in what is the same for every row, and see the products that will be
 * checked. The choices are remembered for files with the same columns (the next price list from
 * the same company).
 */
export interface MatcherOptions {
  categories: { slug: string; name: string }[];
  units: { code: string; name: string }[];
  gstRates: string[];
}

/** The import takes this many rows at a time. */
export const MAX_IMPORT_ROWS = 5000;

const FIELDS: { field: SourceField; label: string; hint?: string }[] = [
  { field: "product_name", label: "Product name", hint: "Rows with the same name become one product with sizes. Leave it out when names are headings above the rows." },
  { field: "variant", label: "Size / variant" },
  { field: "variant2", label: "Colour / finish / type" },
  { field: "sku", label: "Item code" },
  { field: "mrp", label: "MRP" },
  { field: "selling_price", label: "Selling price" },
  { field: "purchase_cost", label: "Dealer / purchase price" },
  { field: "gst_rate", label: "GST %" },
  { field: "hsn_code", label: "HSN code" },
  { field: "unit", label: "Unit" },
  { field: "description", label: "Description / remarks" },
  { field: "brand", label: "Brand" },
  { field: "model", label: "Model" },
  { field: "barcode", label: "Barcode" },
  { field: "image_url", label: "Photo link" },
];

const STORE = "om-import-mapping:";
const PREVIEW_ROWS = 12;
const MAX_PREVIEW_COLS = 24;

const letter = (i: number): string => (i >= 26 ? letter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

function defaults(table: ImportTable, headerRow: number, fileName: string, opts: MatcherOptions): MappingSettings {
  const header = headerRow >= 0 ? table.rows[headerRow] : [];
  const columns = guessColumns(header, table.rows.slice(headerRow + 1, headerRow + 41), headerRow > 0 ? (table.rows[headerRow - 1] ?? []) : []);
  return {
    columns,
    category: opts.categories.length === 1 ? opts.categories[0].slug : "",
    brand: "",
    unit: opts.units.some((u) => u.code === "pcs") ? "pcs" : (opts.units[0]?.code ?? ""),
    gstRate: opts.gstRates.includes("18") ? "18" : "",
    hsnCode: "",
    priceIncludesTax: true,
    sellingFrom: columns.selling_price !== undefined ? "column" : columns.mrp !== undefined ? "mrp" : "none",
    sellingLessPercent: "",
    costFrom: columns.purchase_cost !== undefined ? "column" : "none",
    costLessPercent: "",
    costIncludesTax: false,
    skuFrom: columns.sku !== undefined ? "column" : "auto",
    skuPrefix: "",
    fillDown: true,
    skipWithoutPrice: true,
    sourceInfo: `Imported from ${fileName}`.slice(0, 200),
  };
}

/** Choices saved for a header: everything except where the file came from. */
function remembered(header: string[]): Partial<MappingSettings> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE + header.map(norm).join("|")) ?? "null");
    if (!saved || typeof saved !== "object") return null;
    const columns = Object.fromEntries(Object.entries(saved.columns ?? {}).filter(([, v]) => typeof v === "number" && v >= 0 && v < header.length));
    return { ...saved, columns, sourceInfo: undefined };
  } catch {
    return null;
  }
}

function remember(header: string[], s: MappingSettings) {
  try {
    const { sourceInfo: _, ...rest } = s;
    localStorage.setItem(STORE + header.map(norm).join("|"), JSON.stringify(rest));
  } catch {
    // Private browsing or storage turned off: nothing to remember.
  }
}

export function ColumnMatcher({
  fileName,
  tables,
  options,
  scanned,
  busy,
  onCheck,
}: {
  fileName: string;
  tables: ImportTable[];
  options: MatcherOptions;
  /** The file was a scan or photo read with text recognition; prices need a second look. */
  scanned: { confidence: number; language?: string } | null;
  busy: boolean;
  onCheck: (rows: ImportRow[], sourceRows: number[]) => void;
}) {
  // The guess for a table and header row, or the choices saved for these columns.
  const start = (idx: number, row: number) => {
    const t = tables[idx];
    const base = defaults(t, row, fileName, options);
    const saved = row >= 0 ? remembered(t.rows[row] ?? []) : null;
    return { tableIdx: idx, headerRow: row, s: saved ? { ...base, ...saved, sourceInfo: base.sourceInfo } : base, restored: !!saved };
  };
  // Mounted only once a file has been read in the browser, so the saved choices can be read here.
  const [state, setState] = useState(() => start(0, detectHeaderRow(tables[0].rows)));
  const { tableIdx, headerRow, s, restored } = state;
  const table = tables[tableIdx] ?? tables[0];
  const header = useMemo(() => (headerRow >= 0 ? (table.rows[headerRow] ?? []) : []), [table, headerRow]);
  const width = Math.min(MAX_PREVIEW_COLS * 4, Math.max(0, ...table.rows.slice(0, 400).map((r) => r.length)));
  const setup = (idx: number, row: number) => setState(start(idx, row));
  const setS = (f: (cur: MappingSettings) => MappingSettings) => setState((st) => ({ ...st, s: f(st.s) }));

  const set = <K extends keyof MappingSettings>(k: K, v: MappingSettings[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const setColumn = (field: SourceField, v: string) =>
    setS((cur) => {
      const columns = { ...cur.columns };
      if (v === "") delete columns[field];
      else columns[field] = Number(v);
      const next = { ...cur, columns };
      if (field === "selling_price") next.sellingFrom = v === "" ? (columns.mrp !== undefined ? "mrp" : "none") : "column";
      if (field === "purchase_cost") next.costFrom = v === "" ? "none" : "column";
      if (field === "sku") next.skuFrom = v === "" ? "auto" : "column";
      return next;
    });

  const unitCodes = useMemo(() => options.units.map((u) => u.code), [options.units]);
  const built = useMemo(() => buildImportRows(table.rows, headerRow, s, unitCodes), [table, headerRow, s, unitCodes]);
  const skippedSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of built.skipped) counts.set(k.reason, (counts.get(k.reason) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [built.skipped]);
  const productCount = useMemo(() => new Set(built.rows.map((r) => r.product_name.toLowerCase())).size, [built.rows]);
  // Text recognition can drop a decimal point; prices that don't fit their neighbours are marked.
  const checks = useMemo(() => (scanned ? suspectPrices(built.rows) : []), [scanned, built.rows]);
  const reasonOf = useMemo(() => new Map(checks.map((c) => [c.index, c.reason])), [checks]);
  const [onlyChecks, setOnlyChecks] = useState(true);

  const missing = [!s.category && "the category", s.columns.product_name === undefined && !s.fillDown && "the product name column"].filter(Boolean) as string[];
  const tooMany = built.rows.length > MAX_IMPORT_ROWS;
  const firstRow = Math.max(0, headerRow);
  const preview = table.rows.slice(firstRow, firstRow + PREVIEW_ROWS);
  const columnLabel = (i: number) => {
    const name = header[i]?.trim();
    if (name) return `${letter(i)} · ${name.slice(0, 40)}`;
    const sample = table.rows.slice(firstRow + 1, firstRow + 30).find((r) => r[i]?.trim())?.[i];
    return sample ? `${letter(i)} · e.g. “${sample.slice(0, 30)}”` : `${letter(i)}`;
  };
  const fieldOf = (i: number) => FIELDS.find((f) => s.columns[f.field] === i)?.label;

  return (
    <Card>
      <CardHeader
        title="Match the columns"
        description="Tell us which column holds what. We guessed from the headings — check them against the preview, then fill in what is the same for every row."
      />
      <CardBody className="space-y-6">
        {scanned && (
          <Alert tone="warning" title="This file is a scan, read by text recognition">
            It was about {Math.round(scanned.confidence)}% sure of what it read{scanned.language ? ` (as ${scanned.language})` : ""}. Check every price and code in the preview below against the
            original — a missing decimal point (11.5 read as 115) and look-alike characters (0 and O, 1 and 7, 5 and 6) are the usual slips. Products from a scan are saved as drafts.
          </Alert>
        )}
        {restored && (
          <Alert tone="info">
            Using the choices you made last time for a file with these columns.{" "}
            <button type="button" className="font-semibold underline" onClick={() => setState((st) => ({ ...st, s: defaults(table, headerRow, fileName, options), restored: false }))}>
              Start again from our guess
            </button>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {tables.length > 1 && (
            <Field label="Table" htmlFor="import-table" hint="Each sheet, table or PDF page is listed; “All pages” joins the pages of a PDF.">
              <Select
                id="import-table"
                value={tableIdx}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setup(idx, detectHeaderRow(tables[idx].rows));
                }}
              >
                {tables.map((t, i) => (
                  <option key={i} value={i}>
                    {t.name} — {t.rows.length} rows
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Heading row" htmlFor="import-header" hint="The row with the column names. Rows above it are left out.">
            <Select id="import-header" value={headerRow} onChange={(e) => setup(tableIdx, Number(e.target.value))}>
              <option value={-1}>No heading row</option>
              {table.rows.slice(0, 40).map((r, i) =>
                r.some((c) => c.trim()) ? (
                  <option key={i} value={i}>
                    Row {i + 1}:{" "}
                    {r
                      .filter((c) => c.trim())
                      .slice(0, 5)
                      .join(" · ")
                      .slice(0, 70)}
                  </option>
                ) : null,
              )}
            </Select>
          </Field>
        </div>

        <div>
          <div className="label-sm mb-2 text-navy-600">What&apos;s in the file</div>
          <div className="max-h-[340px] overflow-auto rounded-lg border border-navy-100">
            <table className="w-max min-w-full text-left text-[12.5px]">
              <thead className="sticky top-0 z-[1] bg-paper">
                <tr>
                  <th className="border-b border-navy-100 px-2 py-1.5 tabular text-[11px] font-medium text-navy-500">#</th>
                  {Array.from({ length: Math.min(width, MAX_PREVIEW_COLS) }, (_, i) => (
                    <th key={i} className="border-b border-navy-100 px-2 py-1.5 tabular text-[11px] font-medium text-navy-500">
                      {letter(i)}
                      {fieldOf(i) && <span className="ml-1.5 rounded bg-gold-100 px-1 py-px font-sans text-[11px] text-gold-700">{fieldOf(i)}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, ri) => (
                  <tr key={ri} className={cn(ri === 0 && headerRow >= 0 && "bg-navy-50 font-semibold")}>
                    <td className="border-b border-navy-50 px-2 py-1 tabular text-[11px] text-navy-400">{firstRow + ri + 1}</td>
                    {Array.from({ length: Math.min(width, MAX_PREVIEW_COLS) }, (_, i) => (
                      <td key={i} className="max-w-[14rem] truncate border-b border-navy-50 px-2 py-1 text-navy-800" title={r[i] ?? ""}>
                        {r[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.rows.length - firstRow > PREVIEW_ROWS && (
            <p className="mt-1.5 text-xs text-navy-500">
              First {PREVIEW_ROWS} of {table.rows.length - firstRow} rows.
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-navy-900">Which column holds…</legend>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(({ field, label, hint }) => (
              <Field key={field} label={label} htmlFor={`map-${field}`} required={field === "product_name" && !s.fillDown} hint={hint}>
                <Select id={`map-${field}`} value={s.columns[field] ?? ""} onChange={(e) => setColumn(field, e.target.value)}>
                  <option value="">— Not in the file —</option>
                  {Array.from({ length: width }, (_, i) => (
                    <option key={i} value={i}>
                      {columnLabel(i)}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-navy-900">Same for every row</legend>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Category" htmlFor="fix-category" required>
              <Select id="fix-category" value={s.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">Choose a category…</option>
                {options.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand" htmlFor="fix-brand" hint={s.columns.brand !== undefined ? "Used where the brand column is empty" : "Created if new"}>
              <Input id="fix-brand" value={s.brand} maxLength={80} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Astral" />
            </Field>
            <Field label="Unit" htmlFor="fix-unit" hint={s.columns.unit !== undefined ? "Used where the unit column is empty or unknown" : undefined}>
              <Select id="fix-unit" value={s.unit} onChange={(e) => set("unit", e.target.value)}>
                {options.units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GST %" htmlFor="fix-gst" hint={s.columns.gst_rate !== undefined ? "Used where the GST column is empty" : undefined}>
              <Select id="fix-gst" value={s.gstRate} onChange={(e) => set("gstRate", e.target.value)}>
                <option value="">Not set</option>
                {options.gstRates.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="HSN code" htmlFor="fix-hsn" hint={s.columns.hsn_code !== undefined ? "Used where the HSN column is empty" : "4–8 digits"}>
              <Input id="fix-hsn" value={s.hsnCode} inputMode="numeric" maxLength={8} onChange={(e) => set("hsnCode", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 3917" />
            </Field>
            <Field label="Where the file came from" htmlFor="fix-source">
              <Input id="fix-source" value={s.sourceInfo} maxLength={200} onChange={(e) => set("sourceInfo", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-navy-900">Prices and codes</legend>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Field label="Selling price" htmlFor="rule-selling">
                <Select id="rule-selling" value={s.sellingFrom} onChange={(e) => set("sellingFrom", e.target.value as MappingSettings["sellingFrom"])}>
                  {s.columns.selling_price !== undefined && <option value="column">From the selling price column</option>}
                  <option value="mrp">Same as MRP</option>
                  <option value="mrp_less">MRP less a discount</option>
                  <option value="none">Leave empty — set prices later</option>
                </Select>
              </Field>
              {s.sellingFrom === "mrp_less" && <PercentInput id="rule-selling-pct" label="Discount on MRP" value={s.sellingLessPercent} onChange={(v) => set("sellingLessPercent", v)} />}
            </div>
            <div className="space-y-2">
              <Field label="Purchase cost" htmlFor="rule-cost">
                <Select id="rule-cost" value={s.costFrom} onChange={(e) => set("costFrom", e.target.value as MappingSettings["costFrom"])}>
                  {s.columns.purchase_cost !== undefined && <option value="column">From the dealer / purchase price column</option>}
                  <option value="mrp_less">MRP less the dealer discount</option>
                  <option value="none">Leave empty</option>
                </Select>
              </Field>
              {s.costFrom === "mrp_less" && <PercentInput id="rule-cost-pct" label="Dealer discount on MRP" value={s.costLessPercent} onChange={(v) => set("costLessPercent", v)} />}
              {s.costFrom !== "none" && <Checkbox label="This price includes GST (we store cost before GST)" checked={s.costIncludesTax} onChange={(e) => set("costIncludesTax", e.target.checked)} />}
            </div>
            <div className="space-y-2">
              <Field label="Item codes" htmlFor="rule-sku">
                <Select id="rule-sku" value={s.skuFrom} onChange={(e) => set("skuFrom", e.target.value as MappingSettings["skuFrom"])}>
                  {s.columns.sku !== undefined && <option value="column">From the item code column</option>}
                  <option value="auto">Make codes from brand, name and size</option>
                </Select>
              </Field>
              {s.skuFrom === "auto" && (
                <Field label="Code starts with" htmlFor="rule-prefix" hint="Defaults to the brand">
                  <Input id="rule-prefix" value={s.skuPrefix} maxLength={6} onChange={(e) => set("skuPrefix", e.target.value)} placeholder={s.brand.slice(0, 6).toUpperCase() || "ITEM"} />
                </Field>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Checkbox label="MRP and selling prices include GST" checked={s.priceIncludesTax} onChange={(e) => set("priceIncludesTax", e.target.checked)} />
            <Checkbox label="A row with only a name is a heading — use it as the product name for the rows below it" checked={s.fillDown} onChange={(e) => set("fillDown", e.target.checked)} />
            <Checkbox label="Leave out rows without any price (notes, terms, blank lines)" checked={s.skipWithoutPrice} onChange={(e) => set("skipWithoutPrice", e.target.checked)} />
          </div>
        </fieldset>

        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-navy-900">
              {built.rows.length} {built.rows.length === 1 ? "row" : "rows"} → {productCount} {productCount === 1 ? "product" : "products"}
            </div>
            {skippedSummary.length > 0 && <div className="text-xs text-navy-500">Left out: {skippedSummary.map(([reason, n]) => `${n} × ${reason.toLowerCase()}`).join(" · ")}</div>}
          </div>
          {checks.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>
                <b>{checks.length}</b> {checks.length === 1 ? "row has a price" : "rows have prices"} that look out of line with the rest — marked <b>Check</b> below.
              </span>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="accent-navy-900" checked={onlyChecks} onChange={(e) => setOnlyChecks(e.target.checked)} /> Show only these
              </label>
            </div>
          )}
          <div className="max-h-[360px] overflow-auto rounded-lg border border-navy-100">
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 z-[1] bg-white">
                <tr>
                  <th className={th}>Row</th>
                  <th className={th}>Product</th>
                  <th className={th}>Variant</th>
                  <th className={th}>Code</th>
                  <th className={thNum}>MRP</th>
                  <th className={thNum}>Selling</th>
                  <th className={thNum}>Cost</th>
                  <th className={thNum}>GST</th>
                  <th className={th}>Unit</th>
                  {checks.length > 0 && <th className={th}>Check</th>}
                </tr>
              </thead>
              <tbody>
                {built.rows
                  .map((r, i) => ({ r, i }))
                  .filter(({ i }) => !(checks.length > 0 && onlyChecks) || reasonOf.has(i))
                  .slice(0, 50)
                  .map(({ r, i }) => (
                    <tr key={i} className={cn(reasonOf.has(i) && "bg-amber-50/70")}>
                      <td className={tdCode}>
                        <span className="text-navy-500">{built.sourceRows[i]}</span>
                      </td>
                      <td className={tdText}>{r.product_name}</td>
                      <td className={tdText}>{r.variant_name}</td>
                      <td className={tdCode}>{r.sku}</td>
                      <td className={tdNum}>{r.mrp || "—"}</td>
                      <td className={tdNum}>{r.selling_price || "—"}</td>
                      <td className={tdNum}>{r.purchase_cost || "—"}</td>
                      <td className={tdNum}>{r.gst_rate ? `${r.gst_rate}%` : "—"}</td>
                      <td className={tdCode}>{r.unit}</td>
                      {checks.length > 0 && <td className={tdText}>{reasonOf.has(i) ? <span className="text-xs text-amber-800">{reasonOf.get(i)}</span> : null}</td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {(checks.length > 0 && onlyChecks ? checks.length : built.rows.length) > 50 && <p className="mt-1.5 text-xs text-navy-500">First 50 rows shown.</p>}
        </div>

        {tooMany && (
          <Alert tone="warning">
            That is {built.rows.length} rows; the import takes up to {MAX_IMPORT_ROWS.toLocaleString("en-IN")} at a time.{" "}
            {tables.length > 1 ? "Choose one sheet or page above, or split the file." : "Split the file into parts."}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {missing.length > 0 && <span className="text-sm text-navy-600">Choose {missing.join(" and ")} first.</span>}
          <Button
            icon={<ListChecks className="h-4 w-4" />}
            disabled={missing.length > 0 || built.rows.length === 0 || tooMany}
            loading={busy}
            onClick={() => {
              if (headerRow >= 0) remember(header, s);
              onCheck(built.rows, built.sourceRows);
            }}
          >
            Check {built.rows.length} rows
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function PercentInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Input id={id} value={value} inputMode="decimal" maxLength={6} className="pr-8" onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 32" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-navy-500">%</span>
      </div>
    </Field>
  );
}
