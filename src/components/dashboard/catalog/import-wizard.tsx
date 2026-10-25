"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/page";
import { tdCode, tdText, th } from "@/components/dashboard/table";
import { cn } from "@/components/ui/cn";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { IMPORT_ACCEPT, MAX_IMPORT_FILE_BYTES, type ImportTable } from "@/lib/import-files";
import { importSheet, isTemplateHeader, type ImportRow } from "@/lib/import-files/mapping";
import { ColumnMatcher, MAX_IMPORT_ROWS, type MatcherOptions } from "./column-matcher";

interface RowResult {
  row: number;
  sku: string;
  product: string;
  status: "ok" | "error" | "warning";
  messages: string[];
}
interface Report {
  rows: RowResult[];
  errorCount: number;
  productCount: number;
  variantCount: number;
  photoCount: number;
}
interface ImportResult {
  createdProducts: number;
  createdVariants: number;
  published: boolean;
  images: { stored: number; failed: { product: string; url: string; reason: string }[] };
}
/** The rows being checked, in the import template's columns, and where each came from in the file. */
interface Sheet {
  header: string[];
  rows: string[][];
  sourceRows: number[];
}

const csvOf = async (sheet: Sheet) => {
  const { toCsv } = await import("@/lib/import-files/delimited");
  return toCsv([sheet.header, ...sheet.rows]);
};

export function ImportWizard({ canPublish, ...options }: { canPublish: boolean } & MatcherOptions) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [tables, setTables] = useState<ImportTable[] | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState<"validate" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [readCount, setReadCount] = useState(0);

  const choose = async (files: FileList | null) => {
    const file = files?.[0];
    setReport(null);
    setResult(null);
    setError(null);
    setSheet(null);
    setTables(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) return setError("The file is larger than 40 MB — split it into smaller files.");
    setFileName(file.name);
    setReading(`Reading ${file.name}…`);
    try {
      const { readImportFile } = await import("@/lib/import-files");
      const read = await readImportFile(file.name, new Uint8Array(await file.arrayBuffer()), (done, total) => setReading(`Reading ${file.name} — page ${done} of ${total}`));
      const found = read.tables.filter((t) => t.rows.some((r) => r.some((c) => c.trim())));
      if (!found.length) throw new Error("No rows found in that file.");
      // Our own template goes straight to the check; any other layout is matched first.
      const template = found.find((t) => t.rows.length && isTemplateHeader(t.rows[0]));
      if (template) {
        const body = template.rows
          .slice(1)
          .map((r, i) => ({ r, n: i + 2 }))
          .filter(({ r }) => r.some((c) => c.trim()));
        const next = { header: template.rows[0], rows: body.map((b) => b.r), sourceRows: body.map((b) => b.n) };
        setSheet(next);
        await validate(next);
      } else {
        setTables(found);
        setReadCount((n) => n + 1);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReading(null);
    }
  };

  const validate = async (next: Sheet | null = sheet) => {
    if (!next) return;
    setBusy("validate");
    setError(null);
    try {
      setReport(await apiFetch<Report>("/api/admin/import/validate", { method: "POST", body: { csv: await csvOf(next) } }));
    } catch (err) {
      setReport(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const checkMatched = async (rows: ImportRow[], sourceRows: number[]) => {
    const [header, ...body] = importSheet(rows);
    const next = { header, rows: body, sourceRows };
    setSheet(next);
    setResult(null);
    await validate(next);
    document.getElementById("import-check")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Rows whose code is already in the catalogue (a new price list from the same company). */
  const existing = report?.rows.filter((r) => r.messages.some((m) => /already exists/.test(m))) ?? [];
  const leaveOutExisting = async () => {
    if (!sheet) return;
    const drop = new Set(existing.map((r) => r.row - 2));
    const next = { header: sheet.header, rows: sheet.rows.filter((_, i) => !drop.has(i)), sourceRows: sheet.sourceRows.filter((_, i) => !drop.has(i)) };
    setSheet(next);
    if (next.rows.length) await validate(next);
    else {
      setReport(null);
      setError("Every row is already in your catalogue — there is nothing new to import.");
      document.getElementById("import-upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const commit = async () => {
    if (!sheet) return;
    const photos = report?.photoCount ? ` ${report.photoCount} photo link${report.photoCount > 1 ? "s" : ""} will be downloaded.` : "";
    const where = publish ? "They will go live on the website straight away." : "They will be created as unpublished drafts.";
    if (!confirm(`Import ${report?.productCount} products / ${report?.variantCount} variants? ${where}${photos}`)) return;
    setBusy("commit");
    setError(null);
    try {
      setResult(await apiFetch<ImportResult>("/api/admin/import/commit", { method: "POST", body: { csv: await csvOf(sheet), publish } }));
      setReport(null);
      setSheet(null);
      setTables(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      if (err instanceof ApiError && err.details?.report) setReport(err.details.report as Report);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const warnings = report?.rows.filter((r) => r.status === "warning").length ?? 0;
  const rows = report ? (onlyProblems ? report.rows.filter((r) => r.status !== "ok") : report.rows) : [];
  const sourceRow = (r: RowResult) => sheet?.sourceRows[r.row - 2] ?? r.row;

  return (
    <div className="space-y-6">
      <ol className="grid overflow-hidden rounded-xl border border-navy-100 bg-white shadow-card md:grid-cols-3 md:divide-x md:divide-navy-100">
        <Step n={1} title="Upload the company's file" done={!!tables || !!sheet || !!result}>
          <p>
            The price list or catalogue as the company sent it: <b>PDF</b>, Excel (.xlsx, .xls), Word (.docx), OpenOffice (.ods), CSV or text, web page (.html) or JSON. Or fill in our{" "}
            <a href="/api/admin/import/template" className="inline-flex items-center gap-1 font-mono text-[12.5px] font-medium text-gold-700 underline-offset-[3px] hover:underline">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden /> template
            </a>
            .
          </p>
        </Step>
        <Step n={2} title="Match the columns" done={!!sheet || !!result}>
          <p>Say which column is the name, size, code, MRP and price. We guess from the headings and remember your choices for the next file from the same company.</p>
        </Step>
        <Step n={3} title="Check, then import" done={!!result}>
          <p>Every row is checked first. Nothing is saved until there are no errors.</p>
        </Step>
      </ol>

      <div id="import-upload" className="scroll-mt-6">
        <Card>
          <CardHeader
            title="Upload file"
            description={canPublish ? "Products are created as unpublished drafts unless you choose to publish them straight away." : "Imported products are created as unpublished drafts for review."}
          />
          <CardBody className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            {result && (
              <Alert tone="success" title="Import complete">
                Created {result.createdProducts} products with {result.createdVariants} variants
                {result.published ? ", published on the website" : ""}.{result.images.stored > 0 && ` ${result.images.stored} photo${result.images.stored > 1 ? "s" : ""} added.`} Find them under{" "}
                <Link className="font-semibold underline" href={result.published ? "/dashboard/products?status=published" : "/dashboard/products?status=needs_review"}>
                  {result.published ? "Products → Published" : "Products → Needs review"}
                </Link>
                .
              </Alert>
            )}
            {result && result.images.failed.length > 0 && (
              <Alert tone="warning" title={`${result.images.failed.length} photo${result.images.failed.length > 1 ? "s" : ""} could not be added`}>
                The products were imported; add these photos from the product page instead.
                <ul className="mt-1.5 list-inside list-disc text-xs">
                  {result.images.failed.slice(0, 20).map((f) => (
                    <li key={f.url}>
                      {f.product}: {f.reason}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            <input ref={fileRef} id="csv-file" type="file" accept={IMPORT_ACCEPT} className="sr-only" onChange={(e) => choose(e.target.files)} />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()} loading={!!reading || (busy === "validate" && !tables)}>
                {fileName ? "Choose another file" : "Choose file"}
              </Button>
              {fileName && <span className="break-all font-mono text-[13px] text-navy-700">{fileName}</span>}
            </div>
            {reading ? (
              <p className="text-sm text-navy-600" role="status">
                {reading}
              </p>
            ) : (
              !fileName && (
                <p className="text-xs leading-relaxed text-navy-500">
                  PDF, Excel (.xlsx .xls), Word (.docx), .ods, CSV / text, .html or .json — up to 40 MB. Read in your browser; only the rows you import are sent.
                </p>
              )
            )}
          </CardBody>
        </Card>
      </div>

      {tables && fileName && <ColumnMatcher key={readCount} fileName={fileName} tables={tables} options={options} busy={busy === "validate"} onCheck={checkMatched} />}

      {report && sheet && (
        <div id="import-check" className="scroll-mt-6">
          <Card>
            <CardHeader title="Check" description={tables ? "Change the matching above and check again if something looks wrong." : undefined} />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Mini label="Products" value={report.productCount} />
                <Mini label="Variants (rows)" value={report.variantCount} />
                <Mini label="Warnings" value={warnings} tone={warnings ? "amber" : undefined} />
                <Mini label="Errors" value={report.errorCount} tone={report.errorCount ? "red" : "green"} />
              </div>
              {report.errorCount > 0 ? (
                <Alert tone="danger" title={`${report.errorCount} row${report.errorCount > 1 ? "s need" : " needs"} fixing`}>
                  {tables ? "Fix the matching above, or correct the file and upload it again." : "Correct the file and upload it again."} Nothing has been imported.
                  {existing.length > 0 && (
                    <div className="mt-2">
                      <Button size="sm" variant="outline" loading={busy === "validate"} onClick={leaveOutExisting}>
                        Leave out the {existing.length} {existing.length === 1 ? "row" : "rows"} already in your catalogue
                      </Button>
                    </div>
                  )}
                </Alert>
              ) : (
                <Alert tone="success" title="Ready to import">
                  {warnings ? "Warnings don't block the import, but read them — e.g. items without a price can't be sold yet." : "All rows look good."}
                  {report.photoCount > 0 && ` ${report.photoCount} photo link${report.photoCount > 1 ? "s" : ""} will be downloaded after the import.`}
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 text-sm text-navy-700">
                    <input type="checkbox" className="accent-navy-900" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows with errors or warnings
                  </label>
                  {canPublish && (
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-navy-900">
                      <input type="checkbox" className="accent-navy-900" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish on the website straight away
                    </label>
                  )}
                </div>
                <Button icon={<ShieldCheck className="h-4 w-4" />} disabled={report.errorCount > 0 || report.variantCount > MAX_IMPORT_ROWS} loading={busy === "commit"} onClick={commit}>
                  Import {report.variantCount} variants
                </Button>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-lg border border-navy-100">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 z-[1] bg-white">
                    <tr>
                      <th className={th}>Row</th>
                      <th className={th}>SKU</th>
                      <th className={th}>Product</th>
                      <th className={th}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.row} className={cn(r.status === "error" && "bg-red-50/60")}>
                        <td className={tdCode}>
                          <span className="text-navy-500">{sourceRow(r)}</span>
                        </td>
                        <td className={tdCode}>{r.sku || "—"}</td>
                        <td className={tdText}>{r.product || "—"}</td>
                        <td className={tdText}>
                          {r.status === "ok" ? (
                            <span className="text-[13px] text-navy-500">OK</span>
                          ) : (
                            <Badge tone={r.status === "warning" ? "amber" : "red"}>{r.status === "warning" ? "Warning" : "Error"}</Badge>
                          )}
                          {r.messages.length > 0 && (
                            <ul className="mt-1 list-inside list-disc text-xs text-navy-700">
                              {r.messages.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          title="Columns"
          description="The columns of our import template. A file that uses these exact headings is checked straight away, without matching. Required columns are marked *."
        />
        <CardBody>
          <dl className="grid gap-x-10 text-sm sm:grid-cols-2">
            {COLUMNS.map(([k, v]) => (
              <div key={k} className="flex gap-3 border-b border-navy-100 py-2">
                <dt className="w-44 shrink-0 pt-px font-mono text-[12px] font-medium text-navy-900">{k}</dt>
                <dd className="leading-snug text-navy-600">{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

const COLUMNS: [string, string][] = [
  ["product_name *", "Product name (same for all its variants)"],
  ["category *", "Category slug or exact name, e.g. berger-paints"],
  ["brand", "Brand name — created if new"],
  ["manufacturer / model", "As in the catalogue"],
  ["description", "Product description"],
  ["hsn_code", "4–8 digit HSN code"],
  ["gst_rate", "e.g. 18 — must match an existing GST class"],
  ["unit *", "Unit code: pcs, ltr, bucket, m, ft, length, kg, box, set, roll, pack, bag, nos"],
  ["warranty", "Manufacturer warranty text"],
  ["specifications", "Label: Value; Label: Value"],
  ["source_info", "Where the data came from"],
  ["image_url", "Link to the product photo on the maker's website (https://…). Up to 4, separated by spaces. Downloaded on import"],
  ["sku *", "Unique code for the variant"],
  ["barcode", "Optional barcode"],
  ["variant_name *", "e.g. White · 10 L"],
  ["variant_attributes", "Name=Value; Name=Value (e.g. Colour=White; Pack size=10 L)"],
  ["mrp", "Maximum retail price (optional)"],
  ["selling_price", "Retail price — needs price permission; may need approval"],
  ["price_includes_tax", "yes / no (default: business setting)"],
  ["purchase_cost", "Purchase cost excl. GST — needs cost permission"],
  ["purchase_tax_rate / freight / handling", "Used to compute landed cost"],
  ["is_sample", "yes for demonstration data only"],
];

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className="border-b border-navy-100 p-4 text-sm leading-relaxed text-navy-600 last:border-b-0 md:border-b-0 md:p-5">
      <div className="mb-1.5 flex items-center gap-2.5 font-semibold text-navy-900">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs", done ? "bg-emerald-600 text-white" : "border border-navy-200 text-navy-700")}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        {title}
      </div>
      {children}
    </li>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" | "green" }) {
  return (
    <div className="rounded-lg border border-navy-100 bg-white px-4 py-3">
      <div className="label-mono text-navy-500">{label}</div>
      <div className={cn("headline mt-1.5 text-[1.75rem] font-bold tabular", tone === "red" && "text-red-700", tone === "amber" && "text-amber-700", tone === "green" && "text-emerald-700")}>
        {value}
      </div>
    </div>
  );
}
