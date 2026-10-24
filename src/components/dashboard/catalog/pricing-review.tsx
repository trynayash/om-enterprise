"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleBadge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/page";
import { nameLink, rowHover, tdNum, tdText, th, thNum } from "@/components/dashboard/table";
import { DateTime } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { ClampText } from "@/components/dashboard/clamp-text";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { lineDescription } from "@/lib/line-description";
import { plural } from "@/components/staff/labels";

export interface ReviewItem {
  variantId: string;
  productId: string;
  sku: string;
  product: string;
  isSample: boolean;
  price: string | null;
  landedCost: string | null;
  marginPercent: string | null;
  issues: string[];
}

function issueKind(issue: string): { key: string; tone: Tone } {
  if (/below cost/i.test(issue)) return { key: "Below cost", tone: "red" };
  if (/margin below/i.test(issue)) return { key: "Below margin floor", tone: "amber" };
  if (/no selling price/i.test(issue)) return { key: "No price", tone: "red" };
  if (/cost unknown/i.test(issue)) return { key: "Cost unknown", tone: "neutral" };
  if (/awaiting approval/i.test(issue)) return { key: "Pending change", tone: "blue" };
  if (/not reviewed/i.test(issue)) return { key: "Stale price", tone: "purple" };
  return { key: issue, tone: "neutral" };
}

const ISSUE_TEXT: Record<Tone, string> = {
  red: "text-red-800",
  amber: "text-amber-800",
  blue: "text-sky-800",
  purple: "text-violet-800",
  neutral: "text-navy-600",
  navy: "text-navy-800",
  gold: "text-gold-700",
  green: "text-emerald-800",
};
const ISSUE_DOT: Record<Tone, string> = {
  red: "bg-red-600",
  amber: "bg-amber-500",
  blue: "bg-sky-600",
  purple: "bg-violet-600",
  neutral: "bg-navy-300",
  navy: "bg-navy-700",
  gold: "bg-gold-500",
  green: "bg-emerald-600",
};

const COST_UNKNOWN = "Cost unknown";
const PAGE = 50;

export function NeedsReviewList({ items, showCost, canImport }: { items: ReviewItem[]; showCost: boolean; canImport?: boolean }) {
  const [filter, setFilter] = useState<string>("all");
  const [includeSample, setIncludeSample] = useState(true);
  const [shown, setShown] = useState(PAGE);
  // A missing cost is a gap in the records, not something to fix variant by variant: it is summed up
  // in one line, and the list keeps only what someone can act on (no price, thin margin, stale price…).
  const costUnknown = useMemo(() => items.filter((i) => i.issues.some((x) => issueKind(x).key === COST_UNKNOWN)).length, [items]);
  const actionable = useMemo(
    () => items.map((i) => ({ ...i, issues: i.issues.filter((x) => issueKind(x).key !== COST_UNKNOWN) })).filter((i) => i.issues.length > 0),
    [items],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of actionable) for (const k of new Set(i.issues.map((x) => issueKind(x).key))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [actionable]);
  const visible = actionable.filter((i) => (includeSample || !i.isSample) && (filter === "all" || i.issues.some((x) => issueKind(x).key === filter)));
  const pick = (f: string) => {
    setFilter(f);
    setShown(PAGE);
  };

  const costLine = costUnknown > 0 && (
    <p className="mb-4 flex items-baseline gap-2 border-l-[3px] border-navy-200 py-0.5 pl-3 text-sm leading-relaxed text-navy-700">
      <span>
        <span className="font-semibold text-navy-950">{plural(costUnknown, "variant")}</span> {costUnknown === 1 ? "has" : "have"} no recorded cost — margins can&apos;t be
        checked until purchase costs are entered. Record them on each product page{canImport ? (
          <>
            {" "}
            or in bulk with{" "}
            <Link href="/dashboard/import" className="font-semibold text-navy-900 underline underline-offset-[3px]">
              Import
            </Link>
          </>
        ) : null}
        .
      </span>
    </p>
  );

  if (!actionable.length) {
    if (!costUnknown) return <EmptyState title="Nothing needs attention" description="Every active variant has a price, a known cost and a healthy margin." />;
    return (
      <div>
        {costLine}
        <p className="text-sm text-navy-500">Nothing else needs attention: every active variant has a current selling price, and none is waiting for approval or overdue for review.</p>
      </div>
    );
  }

  return (
    <div>
      {costLine}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip active={filter === "all"} onClick={() => pick("all")}>
          All <span className="font-mono text-[11.5px] tabular opacity-70">{actionable.length}</span>
        </Chip>
        {counts.map(([k, n]) => (
          <Chip key={k} active={filter === k} onClick={() => pick(k)}>
            {k} <span className="font-mono text-[11.5px] tabular opacity-70">{n}</span>
          </Chip>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-navy-600">
          <input type="checkbox" className="accent-navy-900" checked={includeSample} onChange={(e) => setIncludeSample(e.target.checked)} /> Include sample data
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-navy-100">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className={th}>Variant</th>
              <th className={thNum}>Retail price</th>
              {showCost && <th className={thNum}>Landed cost</th>}
              {showCost && <th className={thNum}>Margin</th>}
              <th className={th}>Needs attention</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, shown).map((i) => (
              <tr key={i.variantId} className={rowHover}>
                <td className={tdText}>
                  <Link href={`/dashboard/products/${i.productId}`} className={nameLink}>
                    {i.product}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-navy-500">
                    <span className="font-mono text-[11.5px]">{i.sku}</span>
                    {i.isSample && <SampleBadge label="Sample" />}
                  </div>
                </td>
                <td className={tdNum}>{i.price ? formatINR(i.price) : <span className="text-navy-300">—</span>}</td>
                {showCost && <td className={tdNum}>{i.landedCost ? formatINR(i.landedCost) : <span className="text-navy-300">—</span>}</td>}
                {showCost && (
                  <td className={`${tdNum} font-semibold`}>
                    <span className={i.marginPercent && Number(i.marginPercent) < 0 ? "text-red-700" : undefined}>{i.marginPercent ? `${Number(i.marginPercent).toFixed(1)}%` : <span className="font-normal text-navy-300">—</span>}</span>
                  </td>
                )}
                <td className={tdText}>
                  {/* Issues as quiet dotted notes — a column of badges on every row is mostly noise. */}
                  <ul className="space-y-0.5">
                    {i.issues.map((x) => (
                      <li key={x} className={cn("flex items-baseline gap-1.5 text-[13px] leading-snug", ISSUE_TEXT[issueKind(x).tone])}>
                        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full", ISSUE_DOT[issueKind(x).tone])} />
                        {x}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length > shown && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-xs tabular text-navy-500">
            Showing {shown.toLocaleString("en-IN")} of {visible.length.toLocaleString("en-IN")}
          </span>
          <Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, visible.length - shown)} more
          </Button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150",
        active ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-700 hover:border-navy-900",
      )}
    >
      {children}
    </button>
  );
}

export interface PendingChange {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  listName: string;
  previousPrice: string | null;
  price: string;
  priceIncludesTax: boolean;
  effectiveFrom: string;
  createdAt: string;
  requestedBy: string;
  reason: string;
  marginPercent: string | null;
  previousMarginPercent: string | null;
}

export function PendingPriceChanges({ items, canApprove, showCost }: { items: PendingChange[]; canApprove: boolean; showCost: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (id: string, decision: "approve" | "reject") => {
    const note = decision === "reject" ? prompt("Reason for rejecting?") : "";
    if (decision === "reject" && !note) return;
    setBusy(id);
    try {
      await apiFetch(`/api/admin/prices/${id}/decision`, { method: "POST", body: { decision, note: note || null } });
      toast(decision === "approve" ? "Approved — the new price is live" : "Rejected");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };
  if (!items.length) return <p className="text-sm text-navy-500">No price changes are waiting for approval.</p>;
  return (
    <ul className="divide-y divide-navy-100">
      {items.map((c) => {
        const change = c.previousPrice && Number(c.previousPrice) > 0 ? ((Number(c.price) - Number(c.previousPrice)) / Number(c.previousPrice)) * 100 : null;
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/dashboard/products/${c.productId}`} className={nameLink}>
                  {lineDescription(null, c.productName, c.variantName)}
                </Link>
                <span className="font-mono text-[11.5px] text-navy-500">{c.sku}</span>
              </div>
              <div className="mt-1 text-navy-700">
                <span className="text-navy-500">{c.listName}:</span>{" "}
                <span className="font-mono text-[13px] tabular">
                  <span className="text-navy-400">{c.previousPrice ? formatINR(c.previousPrice) : "—"}</span> → <span className="font-semibold text-navy-950">{formatINR(c.price)}</span>
                </span>{" "}
                <span className="text-navy-500">{c.priceIncludesTax ? "incl." : "excl."} GST</span>
                {change !== null && (
                  <span className={cn("ml-1.5 font-mono text-[12.5px] font-semibold", change < 0 ? "text-red-700" : "text-emerald-700")}>
                    {change > 0 ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>
                )}
                {showCost && c.marginPercent && (
                  <span className="ml-1.5 text-navy-500">
                    · margin{" "}
                    <span className="font-mono text-[12.5px]">
                      {c.previousMarginPercent ? `${Number(c.previousMarginPercent).toFixed(1)}% → ` : ""}
                      {Number(c.marginPercent).toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-1 max-w-3xl text-xs leading-relaxed text-navy-500">
                <ClampText text={`“${c.reason}”`} />
                <div className="mt-0.5">
                  {c.requestedBy}, <DateTime value={c.createdAt} />
                </div>
              </div>
            </div>
            {canApprove && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="success" loading={busy === c.id} icon={<Check className="h-3.5 w-3.5" />} onClick={() => decide(c.id, "approve")}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busy === c.id} icon={<X className="h-3.5 w-3.5" />} onClick={() => decide(c.id, "reject")}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
