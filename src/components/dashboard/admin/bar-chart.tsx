"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-23" → "23 Oct"; other labels pass through. */
function dayLabel(label: string) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(label);
  return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : label;
}

/** Today's IST date as YYYY-MM-DD, the key the day labels use. */
function istToday() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Single-series column chart (one hue, no legend — the title names the series).
 * Navy columns on a hairline grid; today's column is brass, as on the Overview chart, and the
 * hovered or focused column lightens and shows its value. Fills the width of its card (a month fits
 * on a phone); only very long ranges scroll sideways, and those open at the latest day. A table view
 * means no value is reachable only by hovering.
 */
export function BarChart({ data, title, height = 220 }: { data: { label: string; value: number }[]; title: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const [box, setBox] = useState(760);
  const scroller = useRef<HTMLDivElement | null>(null);
  // Measure the chart's container so the columns fill the card at any width.
  const wrap = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A range too long for the card scrolls; start at the right-hand end, where the latest days are.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [box, data.length, asTable]);

  if (!data.length || data.every((d) => d.value === 0)) {
    return (
      <figure>
        <figcaption className="mb-2 text-sm font-semibold text-navy-800">{title}</figcaption>
        <p className="blueprint rounded-lg border border-navy-200 py-10 text-center text-sm text-navy-500">Nothing recorded in this period.</p>
      </figure>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0);
  const niceMax = niceCeil(max);
  const ticks = [0, niceMax / 2, niceMax];
  const padL = 52;
  const padR = 4;
  const padT = 10;
  const padB = 26;
  const slot = Math.max(6, Math.min(56, (box - padL - padR) / data.length));
  const barW = Math.max(3, Math.min(28, Math.round(slot * 0.64)));
  const width = Math.max(box, padL + slot * data.length + padR);
  const today = istToday();
  const plotH = height - padB - padT;
  const base = padT + plotH;
  const y = (v: number) => base - (niceMax ? (v / niceMax) * plotH : 0);
  const labelEvery = Math.max(1, Math.ceil((data.length * 58) / (width - padL)));
  const todayIndex = data.findIndex((d) => d.label === today);
  // Every few columns gets a date; today always does, and a date that would crowd it is skipped.
  const labelled = (i: number) => i === todayIndex || (i % labelEvery === 0 && (todayIndex < 0 || Math.abs(i - todayIndex) >= labelEvery));

  return (
    <figure>
      <div className="mb-3 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold text-navy-800">{title}</figcaption>
        <button type="button" className="text-xs font-semibold text-navy-600 underline-offset-[3px] transition-colors hover:text-navy-950 hover:underline" onClick={() => setAsTable((t) => !t)}>
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border border-navy-100">
          <table className="w-full text-sm">
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-navy-100 last:border-0">
                  <td className="px-3 py-1.5 tabular text-[12.5px] text-navy-600">{d.label}</td>
                  <td className="px-3 py-1.5 text-right tabular text-[13px] font-medium">{formatINR(String(d.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative overflow-x-auto">
          <svg width={width} height={height} role="list" aria-label={title} className="block">
            {ticks.map((t) => (
              <g key={t} aria-hidden>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-navy-400" : "stroke-navy-100"} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-navy-500 tabular text-[11px]">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + i * slot + (slot - barW) / 2;
              const top = y(d.value);
              const h = Math.max(0, base - top);
              const on = hover === i;
              const isToday = d.label === today;
              return (
                <g
                  key={d.label}
                  tabIndex={0}
                  role="listitem"
                  aria-label={`${isToday ? "Today" : d.label}: ${formatINR(String(d.value))}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                >
                  <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
                  {h > 0 && <rect x={x} y={top} width={barW} height={h} className={isToday ? (on ? "fill-gold-600" : "fill-gold-500") : on ? "fill-navy-500" : "fill-navy-800"} shapeRendering="crispEdges" />}
                  {labelled(i) && (
                    <>
                      <line x1={x + barW / 2} x2={x + barW / 2} y1={base} y2={base + 4} className="stroke-navy-400" strokeWidth={1} shapeRendering="crispEdges" />
                      <text x={x + barW / 2} y={height - 6} textAnchor={i === data.length - 1 ? "end" : "middle"} className={isToday ? "fill-gold-700 tabular text-[11px] font-medium" : "fill-navy-500 tabular text-[11px]"}>
                        {isToday ? "Today" : dayLabel(d.label)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-md bg-navy-950 px-2.5 py-1.5 text-xs text-white shadow-lift"
              style={{ left: Math.max(0, Math.min(padL + hover * slot, width - 150)) }}
            >
              <div className="tabular text-[11px] text-navy-300">{data[hover].label === today ? "Today" : dayLabel(data[hover].label)}</div>
              <div className="tabular font-semibold">{formatINR(String(data[hover].value))}</div>
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
