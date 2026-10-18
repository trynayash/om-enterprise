import { formatINR } from "@/lib/money";

export interface DayPoint {
  day: string; // YYYY-MM-DD (IST)
  value: number;
  bills: number;
}

function label(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Simple accessible bar chart (SVG) of daily net sales. Values come only from saved bills. */
export function SalesChart({ points, caption }: { points: DayPoint[]; caption: string }) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const W = 600;
  const H = 170;
  const top = 10;
  const bottom = 24;
  const plotH = H - top - bottom;
  const gap = 3;
  const barW = (W - gap * (points.length - 1)) / points.length;
  const ticks = [0, Math.floor(points.length / 2), points.length - 1];
  const empty = max === 0;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`${caption}. ${empty ? "No sales in this period." : `Highest day ${formatINR(String(max))}.`}`}>
        <line x1="0" x2={W} y1={top + plotH} y2={top + plotH} stroke="#c9d6ea" strokeWidth="1" />
        <line x1="0" x2={W} y1={top} y2={top} stroke="#e6ecf5" strokeWidth="1" strokeDasharray="4 4" />
        {points.map((p, i) => {
          const h = empty ? 0 : Math.max(p.value > 0 ? 2 : 0, (p.value / max) * plotH);
          const x = i * (barW + gap);
          return (
            <g key={p.day}>
              <rect x={x} y={top + plotH - h} width={barW} height={h} rx="2" className={i === points.length - 1 ? "fill-gold-500" : "fill-navy-700"}>
                <title>{`${label(p.day)}: ${formatINR(String(p.value))} net sales, ${p.bills} bill${p.bills === 1 ? "" : "s"}`}</title>
              </rect>
            </g>
          );
        })}
        {ticks.map((i) => (
          <text key={i} x={i * (barW + gap) + barW / 2} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-navy-400 text-[11px]">
            {label(points[i].day)}
          </text>
        ))}
        {!empty && (
          <text x={W} y={top - 2} textAnchor="end" className="fill-navy-400 text-[10px]">
            {formatINR(String(max))}
          </text>
        )}
      </svg>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
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
    </figure>
  );
}
