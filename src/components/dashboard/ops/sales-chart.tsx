import { formatINR } from "@/lib/money";

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
 * Accessible column chart (SVG) of daily net sales: navy columns, today in brass, a crisp baseline
 * and a hairline at the highest day. Values come only from saved bills.
 */
export function SalesChart({ points, caption }: { points: DayPoint[]; caption: string }) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const W = 640;
  const H = 180;
  const left = 44;
  const top = 12;
  const bottom = 24;
  const plotH = H - top - bottom;
  const slot = (W - left) / points.length;
  const barW = Math.max(3, slot * 0.62);
  const ticks = [0, Math.floor(points.length / 2), points.length - 1];
  const empty = max === 0;
  const base = top + plotH;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${caption}. ${empty ? "No sales in this period." : `Highest day ${formatINR(String(max))}.`}`}>
        {!empty && (
          <>
            <line x1={left} x2={W} y1={top} y2={top} className="stroke-navy-100" strokeWidth="1" strokeDasharray="3 3" shapeRendering="crispEdges" />
            <text x={left - 6} y={top + 3.5} textAnchor="end" className="fill-navy-500 font-mono text-[10px]">
              {compact(max)}
            </text>
          </>
        )}
        <text x={left - 6} y={base + 3.5} textAnchor="end" className="fill-navy-400 font-mono text-[10px]">
          0
        </text>
        {points.map((p, i) => {
          const h = empty ? 0 : Math.max(p.value > 0 ? 2 : 0, (p.value / max) * plotH);
          const x = left + i * slot + (slot - barW) / 2;
          return (
            <rect key={p.day} x={x} y={base - h} width={barW} height={h} className={i === points.length - 1 ? "fill-gold-500" : "fill-navy-800"} shapeRendering="crispEdges">
              <title>{`${label(p.day)}: ${formatINR(String(p.value))} net sales, ${p.bills} bill${p.bills === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}
        <line x1={left} x2={W} y1={base} y2={base} className="stroke-navy-400" strokeWidth="1" shapeRendering="crispEdges" />
        {ticks.map((i) => {
          const cx = left + i * slot + slot / 2;
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={base} y2={base + 4} className="stroke-navy-400" strokeWidth="1" shapeRendering="crispEdges" />
              <text x={cx} y={H - 5} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-navy-500 font-mono text-[10px]">
                {i === points.length - 1 ? "Today" : label(points[i].day)}
              </text>
            </g>
          );
        })}
      </svg>
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
