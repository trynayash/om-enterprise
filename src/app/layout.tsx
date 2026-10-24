import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted from npm (OFL) — no network access needed at build time.
// Archivo: an industrial grotesque with a width axis (condensed display, normal text).
const archivo = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-ext-wdth-normal.woff2", style: "normal" },
  ],
  weight: "100 900",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  display: "swap",
});

// IBM Plex Mono: SKUs, sizes, quantities and money — anything read like a spec sheet.
// Latin-ext comes first so the Latin faces win for ordinary text; it supplies the ₹ sign.
const plexMono = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-ext-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:3000"),
  title: { default: "OM ENTERPRISE — Your Complete Building Solution", template: "%s · OM ENTERPRISE" },
  description:
    "OM ENTERPRISE, Naswadi (Gujarat): paints, water tanks, bathware & sanitary fittings, CPVC / PVC / UPVC / SWR pipes and fittings, plumbing accessories and building materials.",
  applicationName: "OM ENTERPRISE",
};

export const viewport: Viewport = {
  themeColor: "#0d1b30",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
