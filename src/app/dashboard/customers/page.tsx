import { Suspense } from "react";
import Link from "next/link";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { listCustomers } from "@/server/services/customers";
import { stateName } from "@/lib/india";
import { EmptyState, PageHeader, PageSkeleton, TableWrap, td, th } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { FilterBar } from "@/components/dashboard/ops/filter-bar";
import { Pagination } from "@/components/dashboard/ops/pagination";
import { CsvExportButton } from "@/components/dashboard/ops/csv-export";
import { CustomerFormButton } from "@/components/dashboard/ops/customer-form";
import { num, str, type SearchParams } from "@/components/dashboard/ops/params";

export const metadata = { title: "Customers" };

const TYPE_TONE = { retail: "neutral", contractor: "gold", business: "navy" } as const;

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
                <th className={`${th} text-right`}>Bills</th>
                <th className={`${th} text-right`}>Lifetime value</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className="hover:bg-navy-50/50">
                  <td className={td}>
                    <Link href={`/dashboard/customers/${c.id}`} className="font-semibold hover:underline">
                      {c.name}
                    </Link>
                    {c.businessName && <div className="text-xs text-navy-500">{c.businessName}</div>}
                  </td>
                  <td className={`${td} tabular`}>{c.mobile ? <a href={`tel:+91${c.mobile}`} className="hover:underline">{c.mobile}</a> : <span className="text-navy-300">—</span>}</td>
                  <td className={`${td} tabular text-xs`}>{c.gstin ?? <span className="text-navy-300">—</span>}</td>
                  <td className={`${td} text-navy-600`}>{[c.city, stateName(c.stateCode)].filter(Boolean).join(", ") || <span className="text-navy-300">—</span>}</td>
                  <td className={td}>
                    <Badge tone={TYPE_TONE[c.customerType]}>{c.customerType}</Badge>
                  </td>
                  <td className={`${td} text-right tabular`}>{c.saleCount}</td>
                  <td className={`${td} text-right font-semibold`}>
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
