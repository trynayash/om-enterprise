import { Suspense } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can, type Actor } from "@/server/auth/actor";
import * as reports from "@/server/services/reports";
import { periodFromQuery } from "@/server/route-helpers";
import { PageHeader, PageSkeleton, TableWrap, td, th, Alert, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateTime, Money, Pct, Qty } from "@/components/ui/money";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { BarChart } from "@/components/dashboard/admin/bar-chart";
import { PeriodFilter } from "@/components/dashboard/admin/period-filter";
import { D, formatINR } from "@/lib/money";

export const metadata = { title: "Reports" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "staff", label: "Staff" },
  { key: "discounts", label: "Discounts" },
  { key: "payments", label: "Collections" },
  { key: "profit", label: "Profit", profit: true },
  { key: "price-changes", label: "Price changes" },
] as const;

export default function ReportsPage(props: PageProps<"/dashboard/reports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports searchParams={props.searchParams} />
    </Suspense>
  );
}

function dayString(d: Date) {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

async function Reports({ searchParams }: { searchParams: PageProps<"/dashboard/reports">["searchParams"] }) {
  const actor = await requirePageActor("reports.view");
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const period = periodFromQuery(q);
  const from = dayString(period.from);
  const to = dayString(new Date(period.to.getTime() - 86400_000));
  const showProfit = can(actor, "reports.profit") && can(actor, "costs.view");
  const tabs = TABS.filter((t) => !("profit" in t) || showProfit);
  const tab = (tabs.find((t) => t.key === sp.tab)?.key ?? "overview") as (typeof TABS)[number]["key"];
  const canExport = can(actor, "reports.export");
  const qs = `from=${from}&to=${to}`;

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description="Calculated only from saved bills, credit notes and verified payments. Training (sample) transactions are excluded."
      />
      <PeriodFilter from={from} to={to} />
      <nav className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-navy-100 bg-white p-1 shadow-card" aria-label="Report">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/reports?tab=${t.key}&${qs}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold", t.key === tab ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" && <Overview actor={actor} period={period} showProfit={showProfit} canExport={canExport} qs={qs} />}
      {tab === "products" && <Products actor={actor} period={period} showProfit={showProfit} canExport={canExport} qs={qs} />}
      {tab === "categories" && <Categories actor={actor} period={period} canExport={canExport} qs={qs} />}
      {tab === "staff" && <Staff actor={actor} period={period} canExport={canExport} qs={qs} />}
      {tab === "discounts" && <Discounts actor={actor} period={period} canExport={canExport} qs={qs} />}
      {tab === "payments" && <Payments actor={actor} period={period} canExport={canExport} qs={qs} />}
      {tab === "profit" && showProfit && <Profit actor={actor} period={period} canExport={canExport} qs={qs} />}
      {tab === "price-changes" && <PriceChanges actor={actor} period={period} canExport={canExport} qs={qs} />}
    </div>
  );
}

type P = { actor: Actor; period: reports.Period; canExport: boolean; qs: string };

function Export({ name, qs, show }: { name: string; qs: string; show: boolean }) {
  if (!show) return null;
  return (
    <a href={`/api/reports/${name}.csv?${qs}`} className={buttonClass("outline", "sm")}>
      <Download className="h-4 w-4" /> CSV
    </a>
  );
}

async function Overview({ actor, period, showProfit, canExport, qs }: P & { showProfit: boolean }) {
  const s = await reports.salesSummary(actor, period);
  const byDay = await reports.salesByDay(actor, period);
  const days: { label: string; value: number }[] = [];
  for (let t = period.from.getTime(); t < period.to.getTime(); t += 86400_000) {
    const label = dayString(new Date(t));
    const row = byDay.find((r) => r.day === label);
    days.push({ label, value: row ? Number(row.taxable) : 0 });
  }
  const empty = s.bills.count === 0 && s.creditNotes.count === 0 && D(s.collections.received).isZero();
  return (
    <div className="space-y-5">
      {empty && <Alert title="No sales recorded in this period">Figures will appear here as soon as bills are issued.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net sales (excl. GST)" value={formatINR(s.netRevenue)} hint={`${s.bills.count} bills · avg ${formatINR(s.averageBill)}`} />
        <Stat label="GST collected (net)" value={formatINR(s.netTax)} hint="Output tax on bills − credit notes" />
        <Stat label="Total billed" value={formatINR(s.netInvoiced)} hint="Including GST, after credit notes" />
        <Stat label="Discounts given" value={formatINR(s.bills.discounts)} hint={`${s.discountPercentOfGross}% of gross sales`} tone="gold" />
        <Stat label="Money collected (net)" value={formatINR(s.collections.net)} hint="Cash flow — verified payments − refunds; not revenue" tone="green" />
        <Stat label="Pending payments" value={formatINR(s.pendingPayments.amount)} hint={`${s.pendingPayments.count} sales with a balance (all dates)`} tone={Number(s.pendingPayments.count) ? "red" : "navy"} />
        <Stat label="Credit notes" value={formatINR(s.creditNotes.total)} hint={`${s.creditNotes.count} returns / adjustments`} />
        <Stat label="Cancelled bills" value={String(s.cancelledBills.count)} hint={formatINR(s.cancelledBills.total)} />
      </div>
      {showProfit && s.profit && <ProfitCard profit={s.profit} />}
      <Card>
        <CardHeader title="Net sales by day" description="Taxable value of bills minus credit notes, per day (IST)" actions={<Export name="sales-by-day" qs={qs} show={canExport} />} />
        <CardBody>
          <BarChart data={days} title="Net sales (₹, excl. GST)" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Collections by payment method" actions={<Export name="summary" qs={qs} show={canExport} />} />
        <CardBody>
          {s.collections.byMethod.length ? (
            <table className="w-full text-sm tabular">
              <thead>
                <tr>
                  <th className={th}>Method</th>
                  <th className={th}>Direction</th>
                  <th className={cn(th, "text-right")}>Payments</th>
                  <th className={cn(th, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {s.collections.byMethod.map((r) => (
                  <tr key={`${r.method}-${r.direction}`}>
                    <td className={td}>{r.method.toUpperCase()}</td>
                    <td className={td}>{r.direction === "in" ? "Received" : <Badge tone="purple">Refund</Badge>}</td>
                    <td className={cn(td, "text-right")}>{r.count}</td>
                    <td className={cn(td, "text-right font-semibold")}>{formatINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-navy-500">No verified payments in this period.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ProfitCard({ profit }: { profit: Awaited<ReturnType<typeof reports.grossProfit>> }) {
  const partial = Number(profit.costCoveragePercent) < 100;
  return (
    <Card>
      <CardHeader title="Gross profit" description={profit.note} />
      <CardBody className="grid gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase text-navy-500">Gross profit</div>
          <div className="text-2xl font-extrabold tabular text-emerald-700">{formatINR(profit.grossProfit)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-navy-500">Gross margin</div>
          <div className="text-2xl font-extrabold tabular">{profit.grossMarginPercent ? `${profit.grossMarginPercent}%` : "—"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-navy-500">Cost of goods sold</div>
          <div className="text-2xl font-extrabold tabular">{formatINR(profit.costOfGoodsSold)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-navy-500">Cost coverage</div>
          <div className={cn("text-2xl font-extrabold tabular", partial ? "text-amber-700" : "")}>{profit.costCoveragePercent}%</div>
        </div>
        {partial && (
          <Alert tone="warning" className="sm:col-span-4">
            Profit is calculated on {formatINR(profit.revenueWithKnownCost)} of {formatINR(profit.itemRevenue)} item sales — {profit.linesWithoutCost} sold line(s) had no recorded cost and are excluded. Record purchase costs for a reliable figure.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

async function Products({ actor, period, showProfit, canExport, qs }: P & { showProfit: boolean }) {
  const rows = await reports.productPerformance(actor, period);
  return (
    <Card>
      <CardHeader title="Product performance" description="Quantity, revenue and average selling price by SKU (after returns)" actions={<Export name="products" qs={qs} show={canExport} />} />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr>
                <th className={th}>SKU</th>
                <th className={th}>Product</th>
                <th className={cn(th, "text-right")}>Qty</th>
                <th className={cn(th, "text-right")}>Revenue</th>
                <th className={cn(th, "text-right")}>Avg price</th>
                <th className={cn(th, "text-right")}>Discount</th>
                {showProfit && <th className={cn(th, "text-right")}>Gross profit</th>}
                {showProfit && <th className={cn(th, "text-right")}>Margin</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId}>
                  <td className={cn(td, "font-mono text-xs")}>{r.sku}</td>
                  <td className={td}>
                    {r.product}
                    <div className="text-xs text-navy-500">{r.category}</div>
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Qty value={r.quantity} unit={r.unit} />
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>
                    <Money value={r.revenue} />
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Money value={r.averageSellingPrice} />
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Pct value={r.discountPercent} />
                  </td>
                  {showProfit && <td className={cn(td, "text-right")}>{r.costComplete ? <Money value={r.grossProfit} /> : <Badge tone="amber">cost unknown</Badge>}</td>}
                  {showProfit && <td className={cn(td, "text-right")}>{r.costComplete ? <Pct value={r.grossMarginPercent} /> : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <CardBody>
          <EmptyState title="No products sold in this period" />
        </CardBody>
      )}
    </Card>
  );
}

async function Categories({ actor, period, canExport, qs }: P) {
  const rows = await reports.categoryRevenue(actor, period);
  const total = rows.reduce((a, r) => a + Number(r.revenue), 0);
  return (
    <Card>
      <CardHeader title="Revenue by category" description="Taxable value of items billed (before returns)" actions={<Export name="categories" qs={qs} show={canExport} />} />
      <CardBody>
        {rows.length ? (
          <ul className="space-y-3">
            {rows.map((r) => {
              const pct = total ? (Number(r.revenue) / total) * 100 : 0;
              return (
                <li key={r.category}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-semibold">{r.category}</span>
                    <span className="tabular">
                      {formatINR(r.revenue)} <span className="text-navy-500">· {pct.toFixed(1)}% · {r.bills} bills</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-navy-100" aria-hidden>
                    <div className="h-2 rounded-full bg-navy-600" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No sales in this period" />
        )}
      </CardBody>
    </Card>
  );
}

async function Staff({ actor, period, canExport, qs }: P) {
  if (!can(actor, "sales.view_all")) return <Alert tone="warning">Staff-wise reports need access to all sales.</Alert>;
  const rows = await reports.staffSales(actor, period);
  return (
    <TableWrap>
      <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
        <h2 className="font-bold">Sales by staff member</h2>
        <Export name="staff" qs={qs} show={canExport} />
      </div>
      <table className="w-full text-sm tabular">
        <thead>
          <tr>
            <th className={th}>Staff</th>
            <th className={cn(th, "text-right")}>Bills</th>
            <th className={cn(th, "text-right")}>Net sales</th>
            <th className={cn(th, "text-right")}>Billed (incl. GST)</th>
            <th className={cn(th, "text-right")}>Discounts</th>
            <th className={cn(th, "text-right")}>Discount %</th>
            <th className={cn(th, "text-right")}>Approved exceptions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.staff}>
              <td className={cn(td, "font-semibold")}>{r.staff}</td>
              <td className={cn(td, "text-right")}>{r.bills}</td>
              <td className={cn(td, "text-right")}>{formatINR(r.revenue)}</td>
              <td className={cn(td, "text-right")}>{formatINR(r.total)}</td>
              <td className={cn(td, "text-right")}>{formatINR(r.discount)}</td>
              <td className={cn(td, "text-right")}>{Number(r.list_total) ? ((Number(r.discount) / Number(r.list_total)) * 100).toFixed(2) : "0.00"}%</td>
              <td className={cn(td, "text-right")}>{r.approvals}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className={td} colSpan={7}>
                No bills in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}

async function Discounts({ actor, period, canExport, qs }: P) {
  const r = await reports.discountReport(actor, period);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total discount" value={formatINR(r.totalDiscount)} tone="gold" />
        <Stat label="Discounted bills" value={String(r.discountedBills)} />
        <Stat label="Needed approval" value={String(r.approvedCount)} hint="Above the cashier's limit" />
      </div>
      <TableWrap>
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 className="font-bold">Discounted bills</h2>
          <Export name="discounts" qs={qs} show={canExport} />
        </div>
        <table className="w-full text-sm tabular">
          <thead>
            <tr>
              <th className={th}>Bill</th>
              <th className={th}>Date</th>
              <th className={th}>Staff</th>
              <th className={cn(th, "text-right")}>List value</th>
              <th className={cn(th, "text-right")}>Discount</th>
              <th className={cn(th, "text-right")}>%</th>
              <th className={th}>Approved by</th>
            </tr>
          </thead>
          <tbody>
            {r.bills.map((b) => (
              <tr key={b.sale_id}>
                <td className={td}>
                  <Link className="font-semibold text-navy-700 hover:underline" href={`/dashboard/sales/${b.sale_id}`}>
                    {b.doc_number}
                  </Link>
                </td>
                <td className={td}>
                  <DateTime value={b.issued_at} />
                </td>
                <td className={td}>{b.staff}</td>
                <td className={cn(td, "text-right")}>{formatINR(b.list_total)}</td>
                <td className={cn(td, "text-right font-semibold")}>{formatINR(b.discount)}</td>
                <td className={cn(td, "text-right")}>{b.effective_percent}%</td>
                <td className={td}>{b.approved_by ?? <span className="text-navy-400">within limit</span>}</td>
              </tr>
            ))}
            {!r.bills.length && (
              <tr>
                <td className={td} colSpan={7}>
                  No discounted bills in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

async function Payments({ actor, period, canExport, qs }: P) {
  const r = await reports.paymentSummary(actor, period);
  const days: { label: string; value: number }[] = [];
  for (let t = period.from.getTime(); t < period.to.getTime(); t += 86400_000) {
    const label = dayString(new Date(t));
    const row = r.byDay.find((x) => x.day === label);
    days.push({ label, value: row ? Number(row.received) - Number(row.refunded) : 0 });
  }
  return (
    <div className="space-y-4">
      <Alert>Collections are money actually received and verified (cash flow). They are not the same as sales revenue — credit sales and part-payments make them differ.</Alert>
      <Card>
        <CardHeader title="Net collections by day" actions={<Export name="payments" qs={qs} show={canExport} />} />
        <CardBody>
          <BarChart data={days} title="Received − refunded (₹)" />
        </CardBody>
      </Card>
      <TableWrap>
        <table className="w-full text-sm tabular">
          <thead>
            <tr>
              <th className={th}>Method</th>
              <th className={th}>Verified by</th>
              <th className={th}>Direction</th>
              <th className={cn(th, "text-right")}>Count</th>
              <th className={cn(th, "text-right")}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.byMethod.map((m) => (
              <tr key={`${m.method}-${m.verification_method}-${m.direction}`}>
                <td className={td}>{m.method.toUpperCase()}</td>
                <td className={td}>{(m.verification_method ?? "—").replace(/_/g, " ")}</td>
                <td className={td}>{m.direction === "in" ? "Received" : "Refund"}</td>
                <td className={cn(td, "text-right")}>{m.count}</td>
                <td className={cn(td, "text-right font-semibold")}>{formatINR(m.amount)}</td>
              </tr>
            ))}
            {!r.byMethod.length && (
              <tr>
                <td className={td} colSpan={5}>
                  No verified payments in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
      {Number(r.reversed?.count) > 0 && (
        <Alert tone="warning">
          {r.reversed.count} payment confirmation(s) worth {formatINR(r.reversed.amount)} were reversed in this period. Review them in Payments.
        </Alert>
      )}
    </div>
  );
}

async function Profit({ actor, period, canExport, qs }: P) {
  const profit = await reports.grossProfit(actor, period);
  const below = await reports.belowCostSales(actor, period);
  return (
    <div className="space-y-4">
      <ProfitCard profit={profit} />
      <TableWrap>
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 className="font-bold">Sold below cost or below the margin floor</h2>
          <Export name="below-cost" qs={qs} show={canExport} />
        </div>
        <table className="w-full text-sm tabular">
          <thead>
            <tr>
              <th className={th}>Bill</th>
              <th className={th}>Item</th>
              <th className={cn(th, "text-right")}>Qty</th>
              <th className={cn(th, "text-right")}>Net sale</th>
              <th className={cn(th, "text-right")}>Cost</th>
              <th className={cn(th, "text-right")}>Gross profit</th>
              <th className={th}>Staff</th>
            </tr>
          </thead>
          <tbody>
            {below.map((b, i) => (
              <tr key={i}>
                <td className={td}>
                  <Link href={`/dashboard/sales/${b.sale_id}`} className="font-semibold text-navy-700 hover:underline">
                    {b.doc_number}
                  </Link>
                  <div className="text-xs text-navy-500">
                    <DateTime value={b.issued_at} />
                  </div>
                </td>
                <td className={td}>
                  {b.product} <span className="font-mono text-xs text-navy-500">{b.sku}</span>
                  <div>{b.below_cost ? <Badge tone="red">below cost</Badge> : <Badge tone="amber">below margin floor</Badge>}</div>
                </td>
                <td className={cn(td, "text-right")}>{Number(b.quantity)}</td>
                <td className={cn(td, "text-right")}>{formatINR(b.taxable_value)}</td>
                <td className={cn(td, "text-right")}>{formatINR(b.cost_total)}</td>
                <td className={cn(td, "text-right font-semibold", Number(b.gross_profit) < 0 && "text-red-700")}>{formatINR(b.gross_profit)}</td>
                <td className={td}>{b.staff}</td>
              </tr>
            ))}
            {!below.length && (
              <tr>
                <td className={td} colSpan={7}>
                  No sales below cost or margin floor in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

async function PriceChanges({ actor, period, canExport, qs }: P) {
  const rows = await reports.priceChangeReport(actor, period);
  const showMargin = can(actor, "costs.view");
  return (
    <TableWrap>
      <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
        <h2 className="font-bold">Price changes</h2>
        <Export name="price-changes" qs={qs} show={canExport} />
      </div>
      <table className="w-full text-sm tabular">
        <thead>
          <tr>
            <th className={th}>When</th>
            <th className={th}>Item</th>
            <th className={th}>List</th>
            <th className={cn(th, "text-right")}>Old → new</th>
            <th className={cn(th, "text-right")}>Change</th>
            {showMargin && <th className={cn(th, "text-right")}>Margin before → after</th>}
            <th className={th}>Status</th>
            <th className={th}>By / approved by</th>
            <th className={th}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>
                <DateTime value={r.created_at} />
              </td>
              <td className={td}>
                {r.product}
                <div className="font-mono text-xs text-navy-500">{r.sku}</div>
              </td>
              <td className={td}>{r.list_name}</td>
              <td className={cn(td, "text-right")}>
                {r.previous_price ? formatINR(r.previous_price) : "—"} → <span className="font-semibold">{formatINR(r.price)}</span>
              </td>
              <td className={cn(td, "text-right")}>{r.changePercent ? `${Number(r.changePercent) > 0 ? "+" : ""}${r.changePercent}%` : "new"}</td>
              {showMargin && (
                <td className={cn(td, "text-right")}>
                  {r.previous_margin ?? "—"}% → {r.new_margin ?? "—"}%
                </td>
              )}
              <td className={td}>
                <Badge tone={r.status === "approved" ? "green" : r.status === "pending" ? "amber" : r.status === "rejected" ? "red" : "neutral"}>{r.status}</Badge>
              </td>
              <td className={td}>
                {r.created_by}
                {r.decided_by && r.decided_by !== r.created_by && <div className="text-xs text-navy-500">✓ {r.decided_by}</div>}
              </td>
              <td className={cn(td, "max-w-56 text-xs text-navy-600")}>{r.reason}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className={td} colSpan={9}>
                No price changes in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}
