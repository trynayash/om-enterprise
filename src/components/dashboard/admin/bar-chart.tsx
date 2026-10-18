"use client";
import { useState } from "react";
import { formatINR } from "@/lib/money";

/**
 * Single-series column chart (one hue, no legend — the title names the series).
 * Columns ≤ 24px, 4px rounded tops, 2px gaps, hairline grid, per-bar hover/focus tooltip,
 * and a table view so no value is only reachable by hovering.
 */
export function BarChart({ data, title, height = 220 }: { data: { label: string; value: number }[]; title: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  if (!data.length || data.every((d) => d.value === 0)) {
    return (
      <figure>
        <figcaption className="mb-2 text-sm font-semibold text-navy-800">{title}</figcaption>
        <p className="rounded-xl border border-dashed border-navy-200 py-10 text-center text-sm text-navy-500">Nothing recorded in this period.</p>
      </figure>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0);
  const niceMax = niceCeil(max);
  const ticks = [0, niceMax / 2, niceMax];
  const padL = 48;
  const padB = 24;
  const slot = Math.max(10, Math.min(44, 760 / data.length));
  const barW = Math.min(24, slot - 2);
  const width = padL + slot * data.length + 8;
  const plotH = height - padB - 8;
  const y = (v: number) => 8 + plotH - (niceMax ? (v / niceMax) * plotH : 0);
  const labelEvery = Math.ceil(data.length / 10);

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold text-navy-800">{title}</figcaption>
        <button type="button" className="text-xs font-semibold text-navy-600 underline-offset-2 hover:underline" onClick={() => setAsTable((t) => !t)}>
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border border-navy-100">
          <table className="w-full text-sm tabular">
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-navy-50">
                  <td className="px-3 py-1.5 text-navy-600">{d.label}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{formatINR(String(d.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg width={width} height={height} role="img" aria-label={title} className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke="#E6ECF5" strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-navy-500 text-[10px]">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + i * slot + (slot - barW) / 2;
              const top = y(d.value);
              const h = Math.max(0, 8 + plotH - top);
              const r = Math.min(4, h);
              const path = h > 0 ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z` : "";
              return (
                <g
                  key={d.label}
                  tabIndex={0}
                  role="listitem"
                  aria-label={`${d.label}: ${formatINR(String(d.value))}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                >
                  <rect x={padL + i * slot} y={8} width={slot} height={plotH} fill="transparent" />
                  {path && <path d={path} fill={hover === i ? "#3A67A6" : "#284F86"} />}
                  {i % labelEvery === 0 && (
                    <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" className="fill-navy-500 text-[10px]">
                      {d.label.slice(5)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lift"
              style={{ left: Math.min(padL + hover * slot, width - 140) }}
            >
              <div className="text-navy-200">{data[hover].label}</div>
              <div className="font-bold tabular">{formatINR(String(data[hover].value))}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

function niceCeil(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function compact(v: number) {
  if (v >= 1e7) return `${(v / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}
