import "server-only";
/**
 * Business reports — computed ONLY from saved records.
 *
 * Definitions (see README "Reports"):
 * - Revenue (net sales) = taxable value of issued, non-cancelled bills − taxable value of credit
 *   notes, excluding output GST. Recognised on the bill/credit-note issue date (IST).
 * - Collections = money actually received (verified payments) − refunds, by verification date.
 *   This is cash flow, NOT revenue.
 * - Gross profit = revenue − cost of goods sold, using the cost snapshot frozen on each line. Lines
 *   without a known cost are excluded and the coverage % is reported. This is NOT net profit:
 *   operating expenses are not recorded in this system.
 * - Training (sample) transactions are always excluded.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { can, requirePermission, type Actor } from "@/server/auth/actor";
import { forbidden } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { D, m } from "@/lib/money";
import { lineDescription } from "@/lib/line-description";

export interface Period {
  from: Date;
  to: Date;
}

const BILL_TYPES = sql`('tax_invoice','bill_of_supply','cash_memo')`;

type Row = Record<string, string | number | boolean | null>;

async function q<T extends Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  const res = await getDb().execute(query);
  return res.rows as T[];
}

function requireProfit(actor: Actor) {
  if (!can(actor, "reports.profit") || !can(actor, "costs.view")) throw forbidden("Profit reports need cost access");
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export async function salesSummary(actor: Actor, p: Period) {
  requirePermission(actor, "reports.view");
  const [bills] = await q<{ count: number; gross: string; line_disc: string; cart_disc: string; taxable: string; tax: string; total: string; round_off: string }>(sql`
    select count(*)::int as count,
      coalesce(sum(s.subtotal_gross),0)::text as gross,
      coalesce(sum(s.line_discount_total),0)::text as line_disc,
      coalesce(sum(s.cart_discount_total),0)::text as cart_disc,
      coalesce(sum(d.taxable_total),0)::text as taxable,
      coalesce(sum(d.tax_total),0)::text as tax,
      coalesce(sum(d.grand_total),0)::text as total,
      coalesce(sum(s.round_off),0)::text as round_off
    from documents d join sales s on s.id = d.sale_id
    where d.doc_type in ${BILL_TYPES} and d.status = 'issued' and not d.is_training
      and d.issued_at >= ${p.from} and d.issued_at < ${p.to}`);
  const [credits] = await q<{ count: number; taxable: string; tax: string; total: string }>(sql`
    select count(*)::int as count, coalesce(sum(d.taxable_total),0)::text as taxable,
      coalesce(sum(d.tax_total),0)::text as tax, coalesce(sum(d.grand_total),0)::text as total
    from documents d where d.doc_type = 'credit_note' and d.status = 'issued' and not d.is_training
      and d.issued_at >= ${p.from} and d.issued_at < ${p.to}`);
  const [cancelled] = await q<{ count: number; total: string }>(sql`
    select count(*)::int as count, coalesce(sum(d.grand_total),0)::text as total
    from documents d where d.doc_type in ${BILL_TYPES} and d.status = 'cancelled' and not d.is_training
      and d.cancelled_at >= ${p.from} and d.cancelled_at < ${p.to}`);
  const collections = await q<{ method: string; direction: string; count: number; amount: string }>(sql`
    select p.method, p.direction, count(*)::int as count, coalesce(sum(p.amount),0)::text as amount
    from payments p join sales s on s.id = p.sale_id
    where p.status = 'successful' and not s.is_training and p.verified_at >= ${p.from} and p.verified_at < ${p.to}
    group by p.method, p.direction order by p.method`);
  const [pending] = await q<{ count: number; amount: string }>(sql`
    select count(*)::int as count,
      coalesce(sum(s.grand_total - coalesce((select sum(r.grand_total) from sale_returns r where r.sale_id = s.id),0) - (s.amount_paid - s.amount_refunded)),0)::text as amount
    from sales s where s.status in ('finalized','completed') and not s.is_training
      and s.grand_total - coalesce((select sum(r.grand_total) from sale_returns r where r.sale_id = s.id),0) - (s.amount_paid - s.amount_refunded) > 0`);

  const received = collections.filter((c) => c.direction === "in").reduce((a, c) => a.plus(D(c.amount)), D(0));
  const refunded = collections.filter((c) => c.direction === "refund").reduce((a, c) => a.plus(D(c.amount)), D(0));
  const discount = D(bills.line_disc).plus(D(bills.cart_disc));
  const out = {
    period: { from: p.from.toISOString(), to: p.to.toISOString() },
    bills: { count: bills.count, gross: bills.gross, discounts: m(discount), taxable: bills.taxable, tax: bills.tax, total: bills.total },
    creditNotes: credits,
    cancelledBills: cancelled,
    netRevenue: m(D(bills.taxable).minus(D(credits.taxable))),
    netTax: m(D(bills.tax).minus(D(credits.tax))),
    netInvoiced: m(D(bills.total).minus(D(credits.total))),
    discountPercentOfGross: D(bills.gross).greaterThan(0) ? discount.div(D(bills.gross)).times(100).toFixed(2) : "0.00",
    averageBill: bills.count ? m(D(bills.total).div(bills.count)) : "0.00",
    collections: { byMethod: collections, received: m(received), refunded: m(refunded), net: m(received.minus(refunded)) },
    pendingPayments: pending,
    profit: null as null | Awaited<ReturnType<typeof grossProfit>>,
  };
  if (can(actor, "reports.profit") && can(actor, "costs.view")) out.profit = await grossProfit(actor, p);
  return out;
}

export async function grossProfit(actor: Actor, p: Period) {
  requireProfit(actor);
  const [sold] = await q<{ revenue: string; known_revenue: string; cost: string; lines: number; unknown_lines: number }>(sql`
    select coalesce(sum(l.taxable_value),0)::text as revenue,
      coalesce(sum(l.taxable_value) filter (where l.cost_total is not null),0)::text as known_revenue,
      coalesce(sum(l.cost_total),0)::text as cost,
      count(*)::int as lines,
      (count(*) filter (where l.cost_total is null))::int as unknown_lines
    from sale_lines l
    join documents d on d.sale_id = l.sale_id and d.doc_type in ${BILL_TYPES} and d.status = 'issued'
    where l.line_type = 'item' and not d.is_training and d.issued_at >= ${p.from} and d.issued_at < ${p.to}`);
  const [returned] = await q<{ revenue: string; known_revenue: string; cost: string }>(sql`
    select coalesce(sum(rl.taxable_value),0)::text as revenue,
      coalesce(sum(rl.taxable_value) filter (where rl.cost_total is not null),0)::text as known_revenue,
      coalesce(sum(rl.cost_total),0)::text as cost
    from sale_return_lines rl join sale_returns r on r.id = rl.return_id
    join documents cn on cn.id = r.credit_note_document_id
    where not cn.is_training and cn.status = 'issued' and cn.issued_at >= ${p.from} and cn.issued_at < ${p.to}`);
  const revenue = D(sold.revenue).minus(D(returned.revenue));
  const knownRevenue = D(sold.known_revenue).minus(D(returned.known_revenue));
  const cogs = D(sold.cost).minus(D(returned.cost));
  const gp = knownRevenue.minus(cogs);
  return {
    itemRevenue: m(revenue),
    revenueWithKnownCost: m(knownRevenue),
    costOfGoodsSold: m(cogs),
    grossProfit: m(gp),
    grossMarginPercent: knownRevenue.greaterThan(0) ? gp.div(knownRevenue).times(100).toFixed(2) : null,
    costCoveragePercent: revenue.greaterThan(0) ? knownRevenue.div(revenue).times(100).toFixed(1) : "100.0",
    linesWithoutCost: sold.unknown_lines,
    note: "Gross profit only (revenue − cost of goods sold). Operating expenses are not recorded, so this is not net profit.",
  };
}

/* ------------------------------------------------------------------ */
/* Breakdowns                                                          */
/* ------------------------------------------------------------------ */

export async function salesByDay(actor: Actor, p: Period) {
  requirePermission(actor, "reports.view");
  return q<{ day: string; bills: number; taxable: string; tax: string; total: string }>(sql`
    select to_char((d.issued_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day,
      count(*) filter (where d.doc_type <> 'credit_note')::int as bills,
      sum(case when d.doc_type = 'credit_note' then -d.taxable_total else d.taxable_total end)::text as taxable,
      sum(case when d.doc_type = 'credit_note' then -d.tax_total else d.tax_total end)::text as tax,
      sum(case when d.doc_type = 'credit_note' then -d.grand_total else d.grand_total end)::text as total
    from documents d
    where (d.doc_type in ${BILL_TYPES} or d.doc_type = 'credit_note') and d.status = 'issued' and not d.is_training
      and d.issued_at >= ${p.from} and d.issued_at < ${p.to}
    group by 1 order by 1`);
}

export async function productPerformance(actor: Actor, p: Period) {
  requirePermission(actor, "reports.view");
  const showProfit = can(actor, "reports.profit") && can(actor, "costs.view");
  const rows = await q<{
    variant_id: string;
    sku: string;
    product_name: string;
    variant_name: string | null;
    category: string;
    unit_code: string;
    qty: string;
    returned_qty: string;
    gross: string;
    discount: string;
    revenue: string;
    returned_revenue: string;
    cost: string | null;
    returned_cost: string | null;
    unknown_cost_lines: number;
    bills: number;
  }>(sql`
    with sold as (
      select l.variant_id, max(l.sku) as sku, max(l.product_name) as product_name, max(l.variant_name) as variant_name, max(l.unit_code) as unit_code,
        sum(l.quantity) as qty, sum(l.gross_amount) as gross, sum(l.line_discount_amount + l.cart_discount_share) as discount,
        sum(l.taxable_value) as revenue, sum(l.cost_total) as cost, count(*) filter (where l.cost_total is null) as unknown_cost_lines,
        count(distinct l.sale_id) as bills
      from sale_lines l
      join documents d on d.sale_id = l.sale_id and d.doc_type in ${BILL_TYPES} and d.status = 'issued'
      where l.line_type = 'item' and not d.is_training and d.issued_at >= ${p.from} and d.issued_at < ${p.to}
      group by l.variant_id
    ), ret as (
      select l.variant_id, sum(rl.quantity) as qty, sum(rl.taxable_value) as revenue, sum(rl.cost_total) as cost
      from sale_return_lines rl join sale_returns r on r.id = rl.return_id join sale_lines l on l.id = rl.sale_line_id
      join documents cn on cn.id = r.credit_note_document_id
      where not cn.is_training and cn.status = 'issued' and cn.issued_at >= ${p.from} and cn.issued_at < ${p.to}
      group by l.variant_id
    )
    select s.variant_id, s.sku, s.product_name, s.variant_name, c.name as category, s.unit_code,
      s.qty::text, coalesce(ret.qty,0)::text as returned_qty, s.gross::text, s.discount::text,
      s.revenue::text, coalesce(ret.revenue,0)::text as returned_revenue,
      s.cost::text, ret.cost::text as returned_cost, s.unknown_cost_lines::int, s.bills::int
    from sold s
    join product_variants v on v.id = s.variant_id
    join products pr on pr.id = v.product_id
    join categories c on c.id = pr.category_id
    left join ret on ret.variant_id = s.variant_id
    order by (s.revenue - coalesce(ret.revenue,0)) desc`);
  return rows.map((r) => {
    const qty = D(r.qty).minus(D(r.returned_qty));
    const revenue = D(r.revenue).minus(D(r.returned_revenue));
    const costKnown = r.unknown_cost_lines === 0 && r.cost !== null;
    const cogs = costKnown ? D(r.cost).minus(D(r.returned_cost ?? 0)) : null;
    const gp = cogs ? revenue.minus(cogs) : null;
    return {
      variantId: r.variant_id,
      sku: r.sku,
      product: lineDescription(null, r.product_name, r.variant_name),
      category: r.category,
      unit: r.unit_code,
      bills: r.bills,
      quantity: qty.toString(),
      grossBeforeDiscount: r.gross,
      discount: r.discount,
      discountPercent: D(r.gross).greaterThan(0) ? D(r.discount).div(D(r.gross)).times(100).toFixed(2) : "0.00",
      revenue: m(revenue),
      averageSellingPrice: qty.greaterThan(0) ? m(revenue.div(qty)) : null,
      grossProfit: showProfit && gp ? m(gp) : null,
      grossMarginPercent: showProfit && gp && revenue.greaterThan(0) ? gp.div(revenue).times(100).toFixed(2) : null,
      costComplete: showProfit ? costKnown : null,
    };
  });
}

export async function categoryRevenue(actor: Actor, p: Period) {
  requirePermission(actor, "reports.view");
  return q<{ category: string; qty: string; revenue: string; bills: number }>(sql`
    select c.name as category, sum(l.quantity)::text as qty, sum(l.taxable_value)::text as revenue, count(distinct l.sale_id)::int as bills
    from sale_lines l
    join documents d on d.sale_id = l.sale_id and d.doc_type in ${BILL_TYPES} and d.status = 'issued'
    join product_variants v on v.id = l.variant_id join products pr on pr.id = v.product_id join categories c on c.id = pr.category_id
    where l.line_type = 'item' and not d.is_training and d.issued_at >= ${p.from} and d.issued_at < ${p.to}
    group by c.name order by sum(l.taxable_value) desc`);
}

export async function staffSales(actor: Actor, p: Period) {
  requirePermission(actor, "reports.view");
  if (!can(actor, "sales.view_all")) throw forbidden("Staff-wise reports need access to all sales");
  return q<{ staff: string; bills: number; revenue: string; total: string; discount: string; list_total: string; approvals: number }>(sql`
    select u.display_name as staff, count(*)::int as bills, sum(d.taxable_total)::text as revenue, sum(d.grand_total)::text as total,
      sum(s.line_discount_total + s.cart_discount_total)::text as discount, sum(s.list_total)::text as list_total,
      count(s.approval_request_id)::int as approvals
    from documents d join sales s on s.id = d.sale_id join users u on u.id = s.created_by
    where d.doc_type in ${BILL_TYPES} and d.status = 'issued' and not d.is_training and d.issued_at >= ${p.from} and d.issued_at < ${p.to}
    group by u.display_name order by sum(d.taxable_total) desc`);
}

export async function discountReport(actor: Actor, p: Period) {
  requirePermission(actor, "reports.view");
  const bills = await q<{
    sale_id: string;
    sale_number: string;
    doc_number: string;
    issued_at: string;
    staff: string;
    list_total: string;
    discount: string;
    effective_percent: string;
    grand_total: string;
    approved_by: string | null;
  }>(sql`
    select s.id as sale_id, s.sale_number, d.doc_number, d.issued_at::text, u.display_name as staff, s.list_total::text,
      (s.list_total - (s.subtotal_gross - s.line_discount_total - s.cart_discount_total))::text as discount,
      s.effective_discount_percent::text as effective_percent, s.grand_total::text,
      (select ua.display_name from approval_requests a join users ua on ua.id = a.decided_by where a.id = s.approval_request_id) as approved_by
    from documents d join sales s on s.id = d.sale_id join users u on u.id = s.created_by
    where d.doc_type in ${BILL_TYPES} and d.status = 'issued' and not d.is_training
      and d.issued_at >= ${p.from} and d.issued_at < ${p.to} and s.effective_discount_percent > 0
    order by s.effective_discount_percent desc limit 500`);
  const listTotal = bills.reduce((a, b) => a.plus(D(b.list_total)), D(0));
  const discount = bills.reduce((a, b) => a.plus(D(b.discount)), D(0));
  return { bills, totalDiscount: m(discount), discountedBills: bills.length, approvedCount: bills.filter((b) => b.approved_by).length, listTotalOfDiscounted: m(listTotal) };
}

export async function belowCostSales(actor: Actor, p: Period) {
  requireProfit(actor);
  const rows = await q<{ doc_number: string; sale_id: string; issued_at: string; sku: string; product: string; variant: string | null; quantity: string; taxable_value: string; cost_total: string; gross_profit: string; below_cost: boolean; staff: string }>(sql`
    select d.doc_number, s.id as sale_id, d.issued_at::text, l.sku, l.product_name as product, l.variant_name as variant,
      l.quantity::text, l.taxable_value::text, l.cost_total::text, l.gross_profit::text, l.below_cost, u.display_name as staff
    from sale_lines l join sales s on s.id = l.sale_id join users u on u.id = s.created_by
    join documents d on d.sale_id = l.sale_id and d.doc_type in ${BILL_TYPES} and d.status = 'issued'
    where (l.below_cost or l.below_margin_floor) and not d.is_training and d.issued_at >= ${p.from} and d.issued_at < ${p.to}
    order by l.gross_profit asc nulls last limit 500`);
  return rows.map(({ variant, ...r }) => ({ ...r, product: lineDescription(null, r.product, variant) }));
}

export async function paymentSummary(actor: Actor, p: Period) {
  // Shop-wide collections: report viewers, or payment viewers who may see every sale (e.g. the accountant).
  if (!can(actor, "reports.view") && !(can(actor, "payments.view") && can(actor, "sales.view_all"))) {
    throw forbidden("You can't view shop-wide payment reports");
  }
  const byMethod = await q<{ method: string; verification_method: string | null; direction: string; count: number; amount: string }>(sql`
    select p.method, p.verification_method, p.direction, count(*)::int as count, sum(p.amount)::text as amount
    from payments p join sales s on s.id = p.sale_id
    where p.status = 'successful' and not s.is_training and p.verified_at >= ${p.from} and p.verified_at < ${p.to}
    group by 1,2,3 order by 1,3`);
  const byDay = await q<{ day: string; received: string; refunded: string }>(sql`
    select to_char((p.verified_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day,
      coalesce(sum(p.amount) filter (where p.direction = 'in'),0)::text as received,
      coalesce(sum(p.amount) filter (where p.direction = 'refund'),0)::text as refunded
    from payments p join sales s on s.id = p.sale_id
    where p.status = 'successful' and not s.is_training and p.verified_at >= ${p.from} and p.verified_at < ${p.to}
    group by 1 order by 1`);
  const reversed = await q<{ count: number; amount: string }>(sql`
    select count(*)::int as count, coalesce(sum(p.amount),0)::text as amount from payments p join sales s on s.id = p.sale_id
    where p.status = 'reversed' and not s.is_training and p.reversed_at >= ${p.from} and p.reversed_at < ${p.to}`);
  return { byMethod, byDay, reversed: reversed[0] };
}

export async function priceChangeReport(actor: Actor, p: Period) {
  requirePermission(actor, ["reports.view", "prices.edit"]);
  const showCost = can(actor, "costs.view");
  const rows = await q<{
    id: string;
    created_at: string;
    sku: string;
    product: string;
    variant: string;
    list_name: string;
    previous_price: string | null;
    price: string;
    status: string;
    reason: string;
    created_by: string;
    decided_by: string | null;
    effective_from: string;
    previous_margin: string | null;
    new_margin: string | null;
  }>(sql`
    select vp.id, vp.created_at::text, v.sku, pr.name as product, v.name as variant, pl.name as list_name, vp.previous_price::text, vp.price::text,
      vp.status, vp.reason, uc.display_name as created_by, ud.display_name as decided_by, vp.effective_from::text,
      vp.previous_margin_percent::text as previous_margin, vp.margin_percent_snapshot::text as new_margin
    from variant_prices vp join product_variants v on v.id = vp.variant_id join products pr on pr.id = v.product_id
    join price_lists pl on pl.id = vp.price_list_id join users uc on uc.id = vp.created_by left join users ud on ud.id = vp.decided_by
    where vp.created_at >= ${p.from} and vp.created_at < ${p.to}
    order by vp.created_at desc limit 1000`);
  return rows.map(({ variant, ...r }) => ({
    ...r,
    product: lineDescription(null, r.product, variant),
    changePercent: r.previous_price && D(r.previous_price).greaterThan(0) ? D(r.price).minus(D(r.previous_price)).div(D(r.previous_price)).times(100).toFixed(2) : null,
    previous_margin: showCost ? r.previous_margin : null,
    new_margin: showCost ? r.new_margin : null,
  }));
}

/** Variants needing attention: no price, no cost, margin below floor, stale price, pending change. */
export async function productsNeedingReview(actor: Actor) {
  requirePermission(actor, ["catalog.view", "prices.edit", "reports.view"]);
  const pricing = await getSettings("pricing");
  const discounts = await getSettings("discounts");
  const tax = await getSettings("tax");
  const showCost = can(actor, "costs.view");
  const rows = await q<{
    variant_id: string;
    product_id: string;
    sku: string;
    product: string;
    variant: string;
    is_sample: boolean;
    price: string | null;
    price_includes_tax: boolean | null;
    price_since: string | null;
    landed_cost: string | null;
    gst_rate: string;
    min_margin: string | null;
    pending: number;
  }>(sql`
    select v.id as variant_id, pr.id as product_id, v.sku, pr.name as product, v.name as variant, pr.is_sample,
      cp.price::text, cp.price_includes_tax, cp.effective_from::text as price_since, cc.landed_cost::text,
      coalesce(vt.gst_rate, pt.gst_rate, 0)::text as gst_rate,
      coalesce(v.min_margin_percent, c.min_margin_percent)::text as min_margin,
      (select count(*)::int from variant_prices x where x.variant_id = v.id and x.status = 'pending') as pending
    from product_variants v join products pr on pr.id = v.product_id join categories c on c.id = pr.category_id
    left join tax_classes vt on vt.id = v.tax_class_id left join tax_classes pt on pt.id = pr.tax_class_id
    left join lateral (select price, price_includes_tax, effective_from from variant_prices x
      where x.variant_id = v.id and x.status = 'approved' and x.effective_from <= now()
        and x.price_list_id = (select id from price_lists where is_default limit 1)
      order by x.effective_from desc limit 1) cp on true
    left join lateral (select landed_cost from variant_costs y where y.variant_id = v.id and y.effective_from <= now()
      order by y.effective_from desc limit 1) cc on true
    where v.is_active and pr.is_active
    order by pr.name, v.name`);
  const staleBefore = Date.now() - pricing.reviewAfterDays * 86400_000;
  const out = [];
  for (const r of rows) {
    const issues: string[] = [];
    if (!r.price) issues.push("No selling price");
    if (!r.landed_cost) issues.push("Cost unknown");
    if (r.pending) issues.push("Price change awaiting approval");
    if (r.price_since && new Date(r.price_since).getTime() < staleBefore) issues.push(`Price not reviewed in ${pricing.reviewAfterDays}+ days`);
    let margin: string | null = null;
    if (r.price && r.landed_cost) {
      const excl =
        tax.registrationType !== "composition" && tax.registrationType !== "unregistered" && r.price_includes_tax
          ? D(r.price).times(100).div(D(100).plus(D(r.gst_rate)))
          : D(r.price);
      const mg = excl.isZero() ? null : excl.minus(D(r.landed_cost)).div(excl).times(100);
      margin = mg ? mg.toFixed(2) : null;
      const floor = r.min_margin ?? (discounts.minMarginPercent || null);
      if (mg && mg.isNegative()) issues.push("Price below cost");
      else if (mg && floor && mg.lessThan(D(floor))) issues.push(`Margin below ${floor}% floor`);
    }
    if (issues.length) {
      out.push({
        variantId: r.variant_id,
        productId: r.product_id,
        sku: r.sku,
        product: lineDescription(null, r.product, r.variant),
        isSample: r.is_sample,
        price: r.price,
        landedCost: showCost ? r.landed_cost : null,
        marginPercent: showCost ? margin : null,
        issues: showCost ? issues : issues.filter((i) => !/cost|margin/i.test(i)),
      });
    }
  }
  return out.filter((r) => r.issues.length);
}

export async function bestSellers(actor: Actor, p: Period, limit = 10) {
  const rows = await productPerformance(actor, p);
  return rows.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formula injection
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}
