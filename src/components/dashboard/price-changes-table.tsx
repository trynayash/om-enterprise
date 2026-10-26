import { StatusBadge } from "@/components/ui/badge";
import { DateTime } from "@/components/ui/money";
import { cn } from "@/components/ui/cn";
import { formatINR } from "@/lib/money";
import type { priceChangeReport } from "@/server/services/reports";
import { ClampText } from "@/components/dashboard/clamp-text";
import { rowHover, tdMuted, tdNum, tdText, th, thNum } from "@/components/dashboard/table";

type PriceChangeRow = Awaited<ReturnType<typeof priceChangeReport>>[number];

/**
 * Price versions as a spec-sheet table that fits its card: fixed columns, the list name under the
 * item, the change under the price, who proposed / approved under the status, and the reason
 * (often a paragraph of research notes) clamped to two lines with the full text a tap away.
 * Wrap it in an `overflow-x-auto` box; on a phone it scrolls inside the card.
 */
export function PriceChangesTable({ rows, showCost }: { rows: PriceChangeRow[]; showCost: boolean }) {
  return (
    <table className="stack-sm w-full min-w-[960px] table-fixed">
      <colgroup>
        <col className="w-[10.5rem]" />
        <col />
        <col className="w-[9.5rem]" />
        {showCost && <col className="w-[8rem]" />}
        <col className="w-[9.5rem]" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th className={th}>When</th>
          <th className={th}>Variant</th>
          <th className={thNum}>Price</th>
          {showCost && <th className={thNum}>Margin</th>}
          <th className={th}>Status</th>
          <th className={th}>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={rowHover}>
            <td data-label="When" className={`${tdMuted} text-[13px]`}>
              <DateTime value={r.created_at} />
            </td>
            <td data-label="Variant" className={tdText}>
              <div className="font-medium">{r.product}</div>
              <div className="mt-0.5 truncate font-mono text-[11.5px] text-navy-500">
                {r.sku} <span className="font-sans">· {r.list_name}</span>
              </div>
            </td>
            <td data-label="Price" className={tdNum}>
              <div className="font-semibold">{formatINR(r.price)}</div>
              <div className="mt-0.5 whitespace-normal text-[12px] text-navy-500">
                {r.previous_price ? (
                  <>
                    was {formatINR(r.previous_price)}
                    {r.changePercent && (
                      <span className={cn("ml-1", Number(r.changePercent) < 0 ? "text-red-700" : "text-emerald-700")}>
                        {Number(r.changePercent) > 0 ? "+" : ""}
                        {Number(r.changePercent).toFixed(1)}%
                      </span>
                    )}
                  </>
                ) : (
                  "new price"
                )}
              </div>
            </td>
            {showCost && (
              <td data-label="Margin" className={tdNum}>
                {r.previous_margin || r.new_margin ? (
                  `${r.previous_margin ? `${Number(r.previous_margin).toFixed(1)}%` : "—"} → ${r.new_margin ? `${Number(r.new_margin).toFixed(1)}%` : "—"}`
                ) : (
                  <span className="text-navy-300">—</span>
                )}
              </td>
            )}
            <td data-label="Status" className={tdText}>
              <StatusBadge status={r.status} />
              <div className="mt-1 text-xs leading-snug text-navy-500">
                by {r.created_by}
                {r.decided_by && r.decided_by !== r.created_by && <div>→ {r.decided_by}</div>}
              </div>
            </td>
            <td data-label="Reason" className={`${tdMuted} text-[13px] leading-snug`}>{r.reason ? <ClampText text={r.reason} /> : <span className="text-navy-300">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
