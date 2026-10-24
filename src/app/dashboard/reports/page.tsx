import { Suspense } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { requirePageActor } from "@/server/auth/session";
import { can, type Actor } from "@/server/auth/actor";
import * as reports from "@/server/services/reports";
import { periodFromQuery } from "@/server/route-helpers";
import { PageHeader, PageSkeleton, TableWrap, Alert, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateTime, Money, Pct, Qty } from "@/components/ui/money";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { BarChart } from "@/components/dashboard/admin/bar-chart";
import { PeriodFilter } from "@/components/dashboard/admin/period-filter";
import { D, formatINR } from "@/lib/money";
import { codeLink, rowHover, tdCode, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

/** Title bar for a table that sits directly in a TableWrap. */
function TableTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-3.5">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-navy-900">{title}</h2>
      {action}
    </div>
  );
}

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
      <nav className="no-print mb-6 flex gap-5 overflow-x-auto border-b border-navy-200" aria-label="Report">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/reports?tab=${t.key}&${qs}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition-colors duration-150",
              t.key === tab ? "border-gold-500 text-navy-950" : "border-transparent text-navy-500 hover:border-navy-200 hover:text-navy-900",
            )}
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <div className="overflow-x-auto">
          {s.collections.byMethod.length ? (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Method</th>
                  <th className={th}>Direction</th>
                  <th className={thNum}>Payments</th>
                  <th className={thNum}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {s.collections.byMethod.map((r) => (
                  <tr key={`${r.method}-${r.direction}`} className={rowHover}>
                    <td className={tdText}>{r.method.toUpperCase()}</td>
                    <td className={tdText}>{r.direction === "in" ? "Received" : <Badge tone="purple">Refund</Badge>}</td>
                    <td className={tdNum}>{r.count}</td>
                    <td className={`${tdNum} font-semibold`}>{formatINR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-4 text-sm text-navy-500">No verified payments in this period.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ProfitCard({ profit }: { profit: Awaited<ReturnType<typeof reports.grossProfit>> }) {
  const partial = Number(profit.costCoveragePercent) < 100;
  return (
    <Card>
      <CardHeader title="Gross profit" description={profit.note} />
      <CardBody className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Gross profit" tone="text-emerald-700">
          {formatINR(profit.grossProfit)}
        </Figure>
        <Figure label="Gross margin">{profit.grossMarginPercent ? `${profit.grossMarginPercent}%` : "—"}</Figure>
        <Figure label="Cost of goods sold">{formatINR(profit.costOfGoodsSold)}</Figure>
        <Figure label="Cost coverage" tone={partial ? "text-amber-700" : undefined}>
          {Number(profit.itemRevenue) > 0 ? `${profit.costCoveragePercent}%` : "—"}
        </Figure>
        {partial && (
          <Alert tone="warning" className="sm:col-span-2 lg:col-span-4">
            Profit is calculated on {formatINR(profit.revenueWithKnownCost)} of {formatINR(profit.itemRevenue)} item sales — {profit.linesWithoutCost} sold line(s) had no recorded cost and are excluded. Record purchase costs for a reliable figure.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

function Figure({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="lg:border-l lg:border-navy-100 lg:pl-5 lg:first:border-l-0 lg:first:pl-0">
      <div className="label-mono text-navy-500">{label}</div>
      <div className={cn("headline mt-1.5 text-[1.75rem] font-bold tabular", tone ?? "text-navy-950")}>{children}</div>
    </div>
  );
}

async function Products({ actor, period, showProfit, canExport, qs }: P & { showProfit: boolean }) {
  const rows = await reports.productPerformance(actor, period);
  return (
    <Card>
      <CardHeader title="Product performance" description="Quantity, revenue and average selling price by SKU (after returns)" actions={<Export name="products" qs={qs} show={canExport} />} />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>SKU</th>
                <th className={th}>Product</th>
                <th className={thNum}>Qty</th>
                <th className={thNum}>Revenue</th>
                <th className={thNum}>Avg price</th>
                <th className={thNum}>Discount</th>
                {showProfit && <th className={thNum}>Gross profit</th>}
                {showProfit && <th className={thNum}>Margin</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId} className={rowHover}>
                  <td className={tdCode}>{r.sku}</td>
                  <td className={tdText}>
                    {r.product}
                    <div className="mt-0.5 text-xs text-navy-500">{r.category}</div>
                  </td>
                  <td className={tdNum}>
                    <Qty value={r.quantity} unit={r.unit} />
                  </td>
                  <td className={`${tdNum} font-semibold`}>
                    <Money value={r.revenue} />
                  </td>
                  <td className={tdNum}>
                    <Money value={r.averageSellingPrice} />
                  </td>
                  <td className={tdNum}>
                    <Pct value={r.discountPercent} />
                  </td>
                  {showProfit && <td className={tdNum}>{r.costComplete ? <Money value={r.grossProfit} /> : <span className="font-sans text-xs text-amber-700">cost unknown</span>}</td>}
                  {showProfit && <td className={tdNum}>{r.costComplete ? <Pct value={r.grossMarginPercent} /> : "—"}</td>}
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
            {rows.map((r, i) => {
              const pct = total ? (Number(r.revenue) / total) * 100 : 0;
              return (
                <li key={r.category}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-semibold">{r.category}</span>
                    <span className="font-mono text-[13px] tabular">
                      {formatINR(r.revenue)}{" "}
                      <span className="text-navy-500">
                        · {pct.toFixed(1)}% · {r.bills} bills
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-navy-100" aria-hidden>
                    <div className={cn("h-1.5", i === 0 ? "bg-gold-500" : "bg-navy-800")} style={{ width: `${pct}%` }} />
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
      <TableTitle title="Sales by staff member" action={<Export name="staff" qs={qs} show={canExport} />} />
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>Staff</th>
            <th className={thNum}>Bills</th>
            <th className={thNum}>Net sales</th>
            <th className={thNum}>Billed (incl. GST)</th>
            <th className={thNum}>Discounts</th>
            <th className={thNum}>Discount %</th>
            <th className={thNum}>Approved exceptions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.staff} className={rowHover}>
              <td className={`${tdText} font-semibold`}>{r.staff}</td>
              <td className={tdNum}>{r.bills}</td>
              <td className={tdNum}>{formatINR(r.revenue)}</td>
              <td className={tdNum}>{formatINR(r.total)}</td>
              <td className={tdNum}>{formatINR(r.discount)}</td>
              <td className={tdNum}>{Number(r.list_total) ? ((Number(r.discount) / Number(r.list_total)) * 100).toFixed(2) : "0.00"}%</td>
              <td className={tdNum}>{r.approvals}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className={tdMuted} colSpan={7}>
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total discount" value={formatINR(r.totalDiscount)} tone="gold" />
        <Stat label="Discounted bills" value={String(r.discountedBills)} />
        <Stat label="Needed approval" value={String(r.approvedCount)} hint="Above the cashier's limit" />
      </div>
      <TableWrap>
        <TableTitle title="Discounted bills" action={<Export name="discounts" qs={qs} show={canExport} />} />
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Bill</th>
              <th className={th}>Date</th>
              <th className={th}>Staff</th>
              <th className={thNum}>List value</th>
              <th className={thNum}>Discount</th>
              <th className={thNum}>%</th>
              <th className={th}>Approved by</th>
            </tr>
          </thead>
          <tbody>
            {r.bills.map((b) => (
              <tr key={b.sale_id} className={rowHover}>
                <td className={tdText}>
                  <Link className={codeLink} href={`/dashboard/sales/${b.sale_id}`}>
                    {b.doc_number}
                  </Link>
                </td>
                <td className={`${tdMuted} whitespace-nowrap`}>
                  <DateTime value={b.issued_at} />
                </td>
                <td className={tdText}>{b.staff}</td>
                <td className={tdNum}>{formatINR(b.list_total)}</td>
                <td className={`${tdNum} font-semibold`}>{formatINR(b.discount)}</td>
                <td className={tdNum}>{b.effective_percent}%</td>
                <td className={tdText}>{b.approved_by ?? <span className="text-navy-400">within limit</span>}</td>
              </tr>
            ))}
            {!r.bills.length && (
              <tr>
                <td className={tdMuted} colSpan={7}>
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
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Method</th>
              <th className={th}>Verified by</th>
              <th className={th}>Direction</th>
              <th className={thNum}>Count</th>
              <th className={thNum}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.byMethod.map((m) => (
              <tr key={`${m.method}-${m.verification_method}-${m.direction}`} className={rowHover}>
                <td className={tdText}>{m.method.toUpperCase()}</td>
                <td className={tdText}>{(m.verification_method ?? "—").replace(/_/g, " ")}</td>
                <td className={tdText}>{m.direction === "in" ? "Received" : "Refund"}</td>
                <td className={tdNum}>{m.count}</td>
                <td className={`${tdNum} font-semibold`}>{formatINR(m.amount)}</td>
              </tr>
            ))}
            {!r.byMethod.length && (
              <tr>
                <td className={tdMuted} colSpan={5}>
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
        <TableTitle title="Sold below cost or below the margin floor" action={<Export name="below-cost" qs={qs} show={canExport} />} />
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Bill</th>
              <th className={th}>Item</th>
              <th className={thNum}>Qty</th>
              <th className={thNum}>Net sale</th>
              <th className={thNum}>Cost</th>
              <th className={thNum}>Gross profit</th>
              <th className={th}>Staff</th>
            </tr>
          </thead>
          <tbody>
            {below.map((b, i) => (
              <tr key={i} className={rowHover}>
                <td className={tdText}>
                  <Link href={`/dashboard/sales/${b.sale_id}`} className={codeLink}>
                    {b.doc_number}
                  </Link>
                  <div className="text-xs text-navy-500">
                    <DateTime value={b.issued_at} />
                  </div>
                </td>
                <td className={tdText}>
                  {b.product} <span className="font-mono text-[11.5px] text-navy-500">{b.sku}</span>
                  <div className="mt-1">{b.below_cost ? <Badge tone="red">below cost</Badge> : <Badge tone="amber">below margin floor</Badge>}</div>
                </td>
                <td className={tdNum}>{Number(b.quantity)}</td>
                <td className={tdNum}>{formatINR(b.taxable_value)}</td>
                <td className={tdNum}>{formatINR(b.cost_total)}</td>
                <td className={`${tdNum} font-semibold`}>
                  <span className={Number(b.gross_profit) < 0 ? "text-red-700" : undefined}>{formatINR(b.gross_profit)}</span>
                </td>
                <td className={tdText}>{b.staff}</td>
              </tr>
            ))}
            {!below.length && (
              <tr>
                <td className={tdMuted} colSpan={7}>
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
      <TableTitle title="Price changes" action={<Export name="price-changes" qs={qs} show={canExport} />} />
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>When</th>
            <th className={th}>Item</th>
            <th className={th}>List</th>
            <th className={thNum}>Old → new</th>
            <th className={thNum}>Change</th>
            {showMargin && <th className={thNum}>Margin before → after</th>}
            <th className={th}>Status</th>
            <th className={th}>By / approved by</th>
            <th className={th}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={rowHover}>
              <td className={`${tdMuted} whitespace-nowrap`}>
                <DateTime value={r.created_at} />
              </td>
              <td className={tdText}>
                {r.product}
                <div className="mt-0.5 font-mono text-[11.5px] text-navy-500">{r.sku}</div>
              </td>
              <td className={tdText}>{r.list_name}</td>
              <td className={tdNum}>
                {r.previous_price ? formatINR(r.previous_price) : "—"} → <span className="font-semibold">{formatINR(r.price)}</span>
              </td>
              <td className={tdNum}>{r.changePercent ? `${Number(r.changePercent) > 0 ? "+" : ""}${r.changePercent}%` : "new"}</td>
              {showMargin && (
                <td className={tdNum}>
                  {r.previous_margin ?? "—"}% → {r.new_margin ?? "—"}%
                </td>
              )}
              <td className={tdText}>
                <Badge tone={r.status === "approved" ? "green" : r.status === "pending" ? "amber" : r.status === "rejected" ? "red" : "neutral"} className="capitalize">
                  {r.status}
                </Badge>
              </td>
              <td className={tdText}>
                {r.created_by}
                {r.decided_by && r.decided_by !== r.created_by && <div className="text-xs text-navy-500">✓ {r.decided_by}</div>}
              </td>
              <td className={`${tdMuted} max-w-56 text-xs`}>{r.reason}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className={tdMuted} colSpan={9}>
                No price changes in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}
