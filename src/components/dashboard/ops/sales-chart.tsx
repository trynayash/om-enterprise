import { formatINR } from "@/lib/money";
import { cn } from "@/components/ui/cn";

export interface DayPoint {
  day: string; // YYYY-MM-DD (IST)
  value: number;
  bills: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(day: string) {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function compact(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `₹${Math.round(v)}`;
}

/**
 * Accessible column chart of daily net sales: navy columns, today in brass, a crisp baseline and a
 * hairline at the highest day. Values come only from saved bills.
 *
 * The columns are drawn in an SVG that stretches to the card; every label is HTML beside it, so the
 * text stays at its real size on a phone instead of shrinking with the drawing.
 */
export function SalesChart({ points, caption }: { points: DayPoint[]; caption: string }) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const n = points.length;
  const barW = 0.62; // share of each day's slot
  const ticks = [0, Math.floor(n / 2), n - 1];
  const empty = max === 0;
  const at = (i: number) => `${((i + 0.5) / n) * 100}%`;
  return (
    <figure>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] pt-2">
        {/* Y axis: the highest day and zero, set against the hairline and the baseline. */}
        <div aria-hidden className="relative h-40 font-mono text-[11px] tabular text-navy-500">
          {!empty && <span className="absolute right-2 top-0 -translate-y-1/2">{compact(max)}</span>}
          <span className="absolute bottom-0 right-2 translate-y-1/2 text-navy-400">0</span>
        </div>
        <div className="relative h-40">
          <svg
            viewBox={`0 0 ${n} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={`${caption}. ${empty ? "No sales in this period." : `Highest day ${formatINR(String(max))}.`}`}
          >
            {!empty && <line x1={0} x2={n} y1={0} y2={0} className="stroke-navy-100" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            {points.map((p, i) => {
              const h = empty ? 0 : Math.max(p.value > 0 ? 1.5 : 0, (p.value / max) * 100);
              return (
                <rect key={p.day} x={i + (1 - barW) / 2} y={100 - h} width={barW} height={h} className={i === n - 1 ? "fill-gold-500" : "fill-navy-800"} shapeRendering="crispEdges">
                  <title>{`${i === n - 1 ? "Today" : label(p.day)}: ${formatINR(String(p.value))} net sales, ${p.bills} bill${p.bills === 1 ? "" : "s"}`}</title>
                </rect>
              );
            })}
            <line x1={0} x2={n} y1={100} y2={100} className="stroke-navy-400" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {/* X axis: first day, middle day and today, each with a short tick under its column. */}
        <div aria-hidden className="relative col-start-2 h-6 font-mono text-[11px] text-navy-500">
          {ticks.map((i) => (
            // The first label starts at its tick and the last ends at it, so neither hangs past the plot.
            <span
              key={i}
              className={cn("absolute top-0 flex flex-col", i === 0 ? "items-start" : i === n - 1 ? "items-end" : "items-center")}
              style={{ left: at(i), transform: i === 0 ? undefined : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
            >
              <span className="h-1 w-px bg-navy-400" />
              <span className={cn("mt-1 whitespace-nowrap", i === n - 1 && "font-medium text-gold-700")}>{i === n - 1 ? "Today" : label(points[i].day)}</span>
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      {/* sr-only goes on a wrapper: a <table> can't be shrunk below its content, so it would stretch the page. */}
      <div className="sr-only">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Net sales</th>
              <th>Bills</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <td>{label(p.day)}</td>
                <td>{formatINR(String(p.value))}</td>
                <td>{p.bills}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
