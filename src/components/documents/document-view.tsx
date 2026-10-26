/**
 * An issued document as it prints: the same A4 sheet as its PDF, drawn from the same layout
 * (server/pdf/bill-sheet.ts) as SVG, in the same fonts. It scales to the width it is given on
 * screen and prints at exactly A4 (see globals.css), from its frozen snapshot ONLY.
 * Used by the POS, the dashboard and customer share links.
 */
import localFont from "next/font/local";
import type { DocSnapshot } from "@/lib/document-types";
import { layoutDocument, PAGE_H, PAGE_W, RULE_COLOR, TEXT_COLOR, type FontKey } from "@/server/pdf/bill-sheet";
import { cn } from "@/components/ui/cn";

const roboto = localFont({
  src: [
    { path: "../../../assets/fonts/Roboto-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/Roboto-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "block",
});
// Only fetched by a browser when a bill has Hindi or Gujarati on it.
const devanagari = localFont({
  src: [
    { path: "../../../assets/fonts/NotoSansDevanagari-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/NotoSansDevanagari-Bold.ttf", weight: "700", style: "normal" },
  ],
  preload: false,
});
const gujarati = localFont({
  src: [
    { path: "../../../assets/fonts/NotoSansGujarati-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../assets/fonts/NotoSansGujarati-Bold.ttf", weight: "700", style: "normal" },
  ],
  preload: false,
});

// A large copy from the image optimiser, so the logo stays sharp when the bill is zoomed or printed.
const LOGO_URL = `/_next/image?url=${encodeURIComponent("/brand/om-enterprise-logo.png")}&w=1080&q=75`;

const FAMILY: Record<FontKey, string> = {
  R: roboto.style.fontFamily,
  B: roboto.style.fontFamily,
  DV: devanagari.style.fontFamily,
  DVB: devanagari.style.fontFamily,
  GJ: gujarati.style.fontFamily,
  GJB: gujarati.style.fontFamily,
};

export function DocumentView({
  snapshot,
  status = "issued",
  cancelReason,
  copyLabel,
  className,
}: {
  snapshot: DocSnapshot;
  status?: "issued" | "cancelled";
  cancelReason?: string | null;
  copyLabel?: string | null;
  className?: string;
}) {
  const pages = layoutDocument(snapshot, { status, cancelReason, copyLabel });
  return (
    <div className={cn("bill-sheets space-y-3 print:space-y-0", className)}>
      {/* Only where a bill is shown: its sheet already carries the margins, so the paper has none. */}
      <style href="bill-print-page" precedence="default">
        {"@media print { @page { size: A4 portrait; margin: 0; } }"}
      </style>
      {pages.map((draws, i) => (
        <svg
          key={i}
          viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
          className="bill-page block h-auto w-full bg-white"
          aria-label={pages.length > 1 ? `${snapshot.title} ${snapshot.number}, page ${i + 1} of ${pages.length}` : `${snapshot.title} ${snapshot.number}`}
        >
          <rect width={PAGE_W} height={PAGE_H} fill="#ffffff" />
          {draws.map((d, j) => {
            if (d.k === "line") return <line key={j} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={RULE_COLOR} strokeWidth={d.width} />;
            if (d.k === "logo") return <image key={j} href={LOGO_URL} x={d.x} y={d.y} width={d.size} height={d.size} />;
            if (d.k === "text")
              return (
                <text
                  key={j}
                  x={d.x}
                  y={d.y + d.ascent * d.size}
                  fontSize={d.size}
                  fontWeight={d.font.endsWith("B") ? 700 : 400}
                  fontFamily={FAMILY[d.font]}
                  fill={TEXT_COLOR}
                  style={{ whiteSpace: "pre" }}
                >
                  {d.text}
                </text>
              );
            const h = d.size * 1.17;
            return (
              <g key={j} transform={`rotate(-30 ${d.cx} ${d.cy})`} fill="#C0392B" fillOpacity={0.14} stroke="#C0392B" strokeOpacity={0.14}>
                <text x={d.cx} y={d.cy} textAnchor="middle" dominantBaseline="central" fontSize={d.size} fontWeight={700} fontFamily={FAMILY.B} stroke="none">
                  {d.text}
                </text>
                {d.framed && <rect x={d.cx - d.w / 2 - 10} y={d.cy - h / 2 - 6} width={d.w + 20} height={h + 10} fill="none" strokeWidth={4} />}
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}
