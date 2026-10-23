import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listDocuments } from "@/server/services/documents";
import type { DocType } from "@/lib/document-types";
import { EmptyState, PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import { SampleBadge, StatusBadge } from "@/components/ui/badge";
import { DateTime, Money } from "@/components/ui/money";
import { FilterBar, type FilterField } from "@/components/dashboard/ops/filter-bar";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { CsvExportButton } from "@/components/dashboard/ops/csv-export";
import { dayRange, num, str, type SearchParams } from "@/components/dashboard/ops/params";
import { DOC_LABEL } from "@/components/dashboard/ops/guard";
import { codeLink, rowHover, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

export const metadata = { title: "Documents" };

const TYPES = ["tax_invoice", "bill_of_supply", "cash_memo", "credit_note", "quotation"] as const;
// Document type as a small coloured dot rather than a badge on every row.
const TYPE_DOT: Record<string, string> = {
  tax_invoice: "bg-navy-800",
  bill_of_supply: "bg-navy-500",
  cash_memo: "bg-navy-300",
  credit_note: "bg-violet-600",
  quotation: "bg-sky-600",
};

export default function DocumentsPage({ searchParams }: PageProps<"/dashboard/documents">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Documents searchParams={searchParams} />
    </Suspense>
  );
}

async function Documents({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor(["documents.reprint", "documents.issue", "sales.view_all"]);
  const sp = await searchParams;
  const page = num(sp, "page", 1);
  const pageSize = 50;
  const { from, to } = dayRange(sp);
  const type = str(sp, "type");
  const status = str(sp, "status");
  const data = await listDocuments(actor, {
    q: str(sp, "q"),
    docType: type && (TYPES as readonly string[]).includes(type) ? (type as DocType) : undefined,
    status: status === "issued" || status === "cancelled" ? status : undefined,
    from,
    to,
    includeTraining: str(sp, "training") === "1",
    page,
    pageSize,
  });

  const fields: FilterField[] = [
    { kind: "search", name: "q", placeholder: "Document no., sale no., customer name or mobile" },
    { kind: "select", name: "type", label: "Type", options: [{ value: "", label: "All types" }, ...TYPES.map((t) => ({ value: t, label: DOC_LABEL[t] }))] },
    {
      kind: "select",
      name: "status",
      label: "Status",
      options: [
        { value: "", label: "All" },
        { value: "issued", label: "Issued" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    { kind: "date", name: "from", label: "From" },
    { kind: "date", name: "to", label: "To" },
    { kind: "toggle", name: "training", label: "Include training" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Documents"
        description="Every issued quotation, bill and credit note. Issued documents are permanent — corrections are made by cancellation or credit note, never by editing."
        actions={
          can(actor, "reports.export") ? (
            <CsvExportButton
              rows={data.items.map((d) => ({
                number: d.docNumber,
                type: d.docType,
                status: d.status,
                issued_at: d.issuedAt.toISOString(),
                sale_no: d.saleNumber,
                customer: d.customerName ?? "",
                total: d.grandTotal,
                tax: d.taxTotal,
                issued_by: d.issuedByName,
                training: d.isTraining ? "yes" : "no",
              }))}
              filename={`om-documents-page-${page}.csv`}
              label="Export page (CSV)"
            />
          ) : null
        }
      />
      <FilterBar fields={fields} values={Object.fromEntries(["q", "type", "status", "from", "to", "training"].map((k) => [k, str(sp, k)]))} />
      {data.items.length === 0 ? (
        <EmptyState title="No documents found" description={str(sp, "training") ? "Try different filters." : "Training (sample) documents are hidden unless you tick “Include training”."} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className={th}>Number</th>
                <th className={th}>Type</th>
                <th className={th}>Issued</th>
                <th className={th}>Customer</th>
                <th className={th}>Sale</th>
                <th className={thNum}>Amount</th>
                <th className={th}>Status</th>
                <th className={th}>Issued by</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className={rowHover}>
                  <td className={tdText}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/dashboard/documents/${d.id}`} className={`${codeLink} whitespace-nowrap`}>
                        {d.docNumber}
                      </Link>
                      {d.isTraining && <SampleBadge label="Training" />}
                    </span>
                  </td>
                  <td className={tdText}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-navy-700">
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[d.docType] ?? "bg-navy-300"}`} />
                      {DOC_LABEL[d.docType] ?? d.docType}
                    </span>
                  </td>
                  <td className={`${tdMuted} whitespace-nowrap`}>
                    <DateTime value={d.issuedAt} />
                  </td>
                  <td className={tdText}>{d.customerName ?? <span className="text-navy-400">Cash sale</span>}</td>
                  <td className={tdText}>
                    <Link href={`/dashboard/sales/${d.saleId}`} className="font-mono text-[13px] text-navy-600 underline-offset-[3px] hover:text-navy-950 hover:underline">
                      {d.saleNumber}
                    </Link>
                  </td>
                  <td className={`${tdNum} font-semibold`}>
                    <span className={d.docType === "credit_note" ? "text-violet-700" : undefined}>
                      {d.docType === "credit_note" ? "− " : ""}
                      <Money value={d.grandTotal} />
                    </span>
                  </td>
                  <td className={tdText}>
                    {/* Issued is the normal state; only a cancellation is stamped. */}
                    {d.status === "issued" ? <span className="text-[13px] text-navy-500">Issued</span> : <StatusBadge status={d.status} />}
                  </td>
                  <td className={tdMuted}>
                    {d.issuedByName}
                    {d.printCount > 0 && <div className="font-mono text-[11.5px] text-navy-400">Printed {d.printCount}×</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination total={data.total} page={page} pageSize={pageSize} sp={sp} basePath="/dashboard/documents" />
    </div>
  );
}
