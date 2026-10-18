"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, SampleBadge, type Tone } from "@/components/ui/badge";
import { EmptyState, td, th } from "@/components/ui/page";
import { DateTime } from "@/components/ui/money";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatINR } from "@/lib/money";

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

export function NeedsReviewList({ items, showCost }: { items: ReviewItem[]; showCost: boolean }) {
  const [filter, setFilter] = useState<string>("all");
  const [includeSample, setIncludeSample] = useState(true);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) for (const k of new Set(i.issues.map((x) => issueKind(x).key))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const visible = items.filter((i) => (includeSample || !i.isSample) && (filter === "all" || i.issues.some((x) => issueKind(x).key === filter)));

  if (!items.length) return <EmptyState title="Nothing needs attention" description="Every active variant has a price, a known cost and a healthy margin." />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="tabular opacity-70">{items.length}</span>
        </Chip>
        {counts.map(([k, n]) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
            {k} <span className="tabular opacity-70">{n}</span>
          </Chip>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-navy-600">
          <input type="checkbox" className="accent-navy-900" checked={includeSample} onChange={(e) => setIncludeSample(e.target.checked)} /> Include sample data
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-navy-100">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className={th}>Variant</th>
              <th className={`${th} text-right`}>Retail price</th>
              {showCost && <th className={`${th} text-right`}>Landed cost</th>}
              {showCost && <th className={`${th} text-right`}>Margin</th>}
              <th className={th}>Needs attention</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.variantId} className="hover:bg-navy-50/50">
                <td className={td}>
                  <Link href={`/dashboard/products/${i.productId}`} className="font-semibold hover:underline">
                    {i.product}
                  </Link>
                  <div className="flex items-center gap-1.5 text-xs text-navy-500">
                    <span className="font-mono">{i.sku}</span>
                    {i.isSample && <SampleBadge label="Sample" />}
                  </div>
                </td>
                <td className={`${td} text-right tabular`}>{i.price ? formatINR(i.price) : "—"}</td>
                {showCost && <td className={`${td} text-right tabular`}>{i.landedCost ? formatINR(i.landedCost) : "—"}</td>}
                {showCost && (
                  <td className={cn(td, "text-right tabular font-semibold", i.marginPercent && Number(i.marginPercent) < 0 ? "text-red-700" : "")}>
                    {i.marginPercent ? `${Number(i.marginPercent).toFixed(1)}%` : "—"}
                  </td>
                )}
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {i.issues.map((x) => (
                      <Badge key={x} tone={issueKind(x).tone}>
                        {x}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        active ? "border-navy-900 bg-navy-900 text-white" : "border-navy-200 bg-white text-navy-700 hover:border-navy-300",
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
    <ul className="space-y-2">
      {items.map((c) => {
        const change = c.previousPrice && Number(c.previousPrice) > 0 ? ((Number(c.price) - Number(c.previousPrice)) / Number(c.previousPrice)) * 100 : null;
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <div className="min-w-0 text-sm">
              <Link href={`/dashboard/products/${c.productId}`} className="font-semibold text-navy-900 hover:underline">
                {c.productName} — {c.variantName}
              </Link>{" "}
              <span className="font-mono text-xs text-navy-500">{c.sku}</span>
              <div className="mt-0.5 text-navy-800">
                {c.listName}: {c.previousPrice ? formatINR(c.previousPrice) : "—"} → <b>{formatINR(c.price)}</b> {c.priceIncludesTax ? "incl." : "excl."} GST
                {change !== null && <span className={cn("ml-1 font-semibold", change < 0 ? "text-red-700" : "text-emerald-700")}>({change > 0 ? "+" : ""}{change.toFixed(1)}%)</span>}
                {showCost && c.marginPercent && (
                  <span className="ml-1 text-navy-600">
                    · margin {c.previousMarginPercent ? `${Number(c.previousMarginPercent).toFixed(1)}% → ` : ""}
                    {Number(c.marginPercent).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-xs text-navy-500">
                “{c.reason}” — {c.requestedBy}, <DateTime value={c.createdAt} />
              </div>
            </div>
            {canApprove && (
              <div className="flex gap-2">
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
