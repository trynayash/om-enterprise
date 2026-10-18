"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, td, th } from "@/components/ui/page";
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
}

export function ImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<{ createdProducts: number; createdVariants: number } | null>(null);
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
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return setError("Please choose a .csv file (in Excel / Google Sheets use File → Save as / Download → CSV UTF-8).");
    const text = await file.text();
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
    if (!confirm(`Import ${report?.productCount} products / ${report?.variantCount} variants? They will be created as unpublished drafts.`)) return;
    setBusy("commit");
    setError(null);
    try {
      setResult(await apiFetch<{ createdProducts: number; createdVariants: number }>("/api/admin/import/commit", { method: "POST", body: { csv } }));
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
      <div className="grid gap-4 md:grid-cols-3">
        <Step n={1} title="Download the template" done={false}>
          <p>One row per variant. Rows with the same product name, brand and category become one product.</p>
          <a href="/api/admin/import/template" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700 hover:underline">
            <FileSpreadsheet className="h-4 w-4" /> om-product-import-template.csv
          </a>
        </Step>
        <Step n={2} title="Fill it in & save as CSV" done={false}>
          <p>
            Use real data from catalogues / data sheets. In Excel: <b>File → Save As → CSV UTF-8</b>. In Google Sheets: <b>File → Download → CSV</b>.
          </p>
        </Step>
        <Step n={3} title="Upload, check, import" done={!!result}>
          <p>We check every row first. Nothing is saved until the file has no errors.</p>
        </Step>
      </div>

      <Card>
        <CardHeader title="Upload file" description="Imported products are created as unpublished drafts — review and publish them individually." />
        <CardBody className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {result && (
            <Alert tone="success" title="Import complete">
              Created {result.createdProducts} products with {result.createdVariants} variants. Find them under{" "}
              <Link className="font-semibold underline" href="/dashboard/products?status=needs_review">
                Products → Needs review
              </Link>
              .
            </Alert>
          )}
          <input ref={fileRef} id="csv-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files)} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()} loading={busy === "validate"}>
              {fileName ? "Choose another file" : "Choose CSV file"}
            </Button>
            {fileName && <span className="text-sm text-navy-700">{fileName}</span>}
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
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" className="accent-navy-900" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows with errors or warnings
                </label>
                <Button icon={<ShieldCheck className="h-4 w-4" />} disabled={report.errorCount > 0} loading={busy === "commit"} onClick={commit}>
                  Import {report.variantCount} variants
                </Button>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-xl border border-navy-100">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0">
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
                        <td className={`${td} tabular text-navy-500`}>{r.row}</td>
                        <td className={`${td} font-mono text-xs`}>{r.sku || "—"}</td>
                        <td className={td}>{r.product || "—"}</td>
                        <td className={td}>
                          <Badge tone={r.status === "ok" ? "green" : r.status === "warning" ? "amber" : "red"}>{r.status === "ok" ? "OK" : r.status === "warning" ? "Warning" : "Error"}</Badge>
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
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {COLUMNS.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-40 shrink-0 font-mono text-xs font-semibold text-navy-900">{k}</dt>
                <dd className="text-navy-600">{v}</dd>
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
    <div className="rounded-2xl border border-navy-100 bg-white p-4 text-sm text-navy-600 shadow-card">
      <div className="mb-1 flex items-center gap-2 font-bold text-navy-900">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", done ? "bg-emerald-600 text-white" : "bg-navy-900 text-white")}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" | "green" }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-navy-500">{label}</div>
      <div className={cn("text-2xl font-extrabold tabular", tone === "red" && "text-red-700", tone === "amber" && "text-amber-700", tone === "green" && "text-emerald-700")}>{value}</div>
    </div>
  );
}
