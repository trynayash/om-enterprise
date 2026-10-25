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

export function ImportWizard({ canPublish }: { canPublish: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState<"validate" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const choose = async (files: FileList | null) => {
    const file = files?.[0];
    setReport(null);
    setResult(null);
    setError(null);
    if (!file) return;
    if (file.size > 5_000_000) return setError("The file is larger than 5 MB — split it into smaller files.");
    if (/\.xls$/i.test(file.name)) return setError("Old Excel files (.xls) can't be read. In Excel use File → Save As → Excel Workbook (.xlsx), or save as CSV.");
    const isExcel = /\.xlsx$/i.test(file.name);
    if (!isExcel && !/\.csv$/i.test(file.name) && file.type !== "text/csv") return setError("Choose an Excel (.xlsx) or CSV file.");
    let text: string;
    try {
      if (isExcel) {
        const { readXlsxRows, toCsv } = await import("@/lib/xlsx");
        text = toCsv(readXlsxRows(new Uint8Array(await file.arrayBuffer())));
      } else text = await file.text();
    } catch (err) {
      return setError(errorMessage(err));
    }
    setFileName(file.name);
    setCsv(text);
    await validate(text);
  };

  const validate = async (text = csv) => {
    if (!text) return;
    setBusy("validate");
    setError(null);
    try {
      setReport(await apiFetch<Report>("/api/admin/import/validate", { method: "POST", body: { csv: text } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!csv) return;
    const photos = report?.photoCount ? ` ${report.photoCount} photo link${report.photoCount > 1 ? "s" : ""} will be downloaded.` : "";
    const where = publish ? "They will go live on the website straight away." : "They will be created as unpublished drafts.";
    if (!confirm(`Import ${report?.productCount} products / ${report?.variantCount} variants? ${where}${photos}`)) return;
    setBusy("commit");
    setError(null);
    try {
      setResult(await apiFetch<ImportResult>("/api/admin/import/commit", { method: "POST", body: { csv, publish } }));
      setReport(null);
      setCsv(null);
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

  return (
    <div className="space-y-6">
      <ol className="grid overflow-hidden rounded-xl border border-navy-100 bg-white shadow-card md:grid-cols-3 md:divide-x md:divide-navy-100">
        <Step n={1} title="Download the template" done={false}>
          <p>One row per variant (size, colour…). Rows with the same product name, brand and category become one product.</p>
          <a href="/api/admin/import/template" className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[12.5px] font-medium text-gold-700 underline-offset-[3px] hover:underline">
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden /> om-product-import-template.csv
          </a>
        </Step>
        <Step n={2} title="Fill it in" done={false}>
          <p>
            Use real data from the brand&apos;s catalogue or price list. Upload the Excel file (.xlsx) as it is, or a CSV. From Google Sheets use{" "}
            <b>File → Download → Microsoft Excel</b>.
          </p>
        </Step>
        <Step n={3} title="Upload, check, import" done={!!result}>
          <p>We check every row first. Nothing is saved until the file has no errors.</p>
        </Step>
      </ol>

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
              {result.published ? ", published on the website" : ""}.
              {result.images.stored > 0 && ` ${result.images.stored} photo${result.images.stored > 1 ? "s" : ""} added.`} Find them under{" "}
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
          <input
            ref={fileRef}
            id="csv-file"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => choose(e.target.files)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()} loading={busy === "validate"}>
              {fileName ? "Choose another file" : "Choose Excel or CSV file"}
            </Button>
            {fileName && <span className="font-mono text-[13px] text-navy-700">{fileName}</span>}
            {csv && report && (
              <Button variant="ghost" size="sm" onClick={() => validate()} loading={busy === "validate"}>
                Re-check
              </Button>
            )}
          </div>

          {report && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Mini label="Products" value={report.productCount} />
                <Mini label="Variants (rows)" value={report.variantCount} />
                <Mini label="Warnings" value={warnings} tone={warnings ? "amber" : undefined} />
                <Mini label="Errors" value={report.errorCount} tone={report.errorCount ? "red" : "green"} />
              </div>
              {report.errorCount > 0 ? (
                <Alert tone="danger" title={`${report.errorCount} row${report.errorCount > 1 ? "s need" : " needs"} fixing`}>
                  Correct the file and upload it again. Nothing has been imported.
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
                <Button icon={<ShieldCheck className="h-4 w-4" />} disabled={report.errorCount > 0} loading={busy === "commit"} onClick={commit}>
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
                          <span className="text-navy-500">{r.row}</span>
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
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Columns" description="Required columns are marked *. Use the exact header names from the template." />
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
      <div className={cn("headline mt-1.5 text-[1.75rem] font-bold tabular", tone === "red" && "text-red-700", tone === "amber" && "text-amber-700", tone === "green" && "text-emerald-700")}>{value}</div>
    </div>
  );
}
