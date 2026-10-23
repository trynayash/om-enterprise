import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listCustomers } from "@/server/services/customers";
import { stateName } from "@/lib/india";
import { EmptyState, PageHeader, PageSkeleton, TableWrap } from "@/components/ui/page";
import { Money } from "@/components/ui/money";
import { FilterBar } from "@/components/dashboard/ops/filter-bar";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { CsvExportButton } from "@/components/dashboard/ops/csv-export";
import { CustomerFormButton } from "@/components/dashboard/ops/customer-form";
import { num, str, type SearchParams } from "@/components/dashboard/ops/params";
import { nameLink, rowHover, tdCode, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

export const metadata = { title: "Customers" };

const TYPE_LABEL = { retail: "Retail", contractor: "Contractor", business: "Business" } as const;

export default function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}

async function Customers({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePageActor("customers.view");
  const sp = await searchParams;
  const page = num(sp, "page", 1);
  const pageSize = 50;
  const data = await listCustomers(actor, str(sp, "q"), page, pageSize);

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Customers"
        description="People and businesses you have billed. Bills and lifetime value count completed, real (non-training) sales only."
        actions={
          <>
            {can(actor, "reports.export") ? (
              <CsvExportButton
                rows={data.items.map((c) => ({
                  name: c.name,
                  business: c.businessName ?? "",
                  mobile: c.mobile ?? "",
                  gstin: c.gstin ?? "",
                  type: c.customerType,
                  city: c.city ?? "",
                  bills: c.saleCount,
                  lifetime_value: c.lifetimeValue,
                }))}
                filename={`om-customers-page-${page}.csv`}
                label="Export page (CSV)"
              />
            ) : null}
            {can(actor, "customers.edit") && <CustomerFormButton />}
          </>
        }
      />
      <FilterBar fields={[{ kind: "search", name: "q", placeholder: "Name, business, mobile or GSTIN" }]} values={{ q: str(sp, "q") }} />
      {data.items.length === 0 ? (
        <EmptyState title={str(sp, "q") ? "No matching customers" : "No customers yet"} description="Customers are added when a bill records their details, or here." />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Mobile</th>
                <th className={th}>GSTIN</th>
                <th className={th}>Location</th>
                <th className={th}>Type</th>
                <th className={thNum}>Bills</th>
                <th className={thNum}>Lifetime value</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className={rowHover}>
                  <td className={tdText}>
                    <Link href={`/dashboard/customers/${c.id}`} className={nameLink}>
                      {c.name}
                    </Link>
                    {c.businessName && <div className="mt-0.5 text-xs text-navy-500">{c.businessName}</div>}
                  </td>
                  <td className={tdCode}>
                    {c.mobile ? (
                      <a href={`tel:+91${c.mobile}`} className="underline-offset-[3px] hover:underline">
                        {c.mobile}
                      </a>
                    ) : (
                      <span className="text-navy-300">—</span>
                    )}
                  </td>
                  <td className={tdCode}>{c.gstin ?? <span className="text-navy-300">—</span>}</td>
                  <td className={tdMuted}>{[c.city, stateName(c.stateCode)].filter(Boolean).join(", ") || <span className="text-navy-300">—</span>}</td>
                  <td className={tdText}>
                    <span className={c.customerType === "retail" ? "text-[13px] text-navy-500" : "text-[13px] font-medium text-navy-800"}>{TYPE_LABEL[c.customerType] ?? c.customerType}</span>
                  </td>
                  <td className={tdNum}>{c.saleCount}</td>
                  <td className={`${tdNum} font-semibold`}>
                    <Money value={c.lifetimeValue} muted={c.lifetimeValue === "0"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Pagination total={data.total} page={page} pageSize={pageSize} sp={sp} basePath="/dashboard/customers" />
    </div>
  );
}
