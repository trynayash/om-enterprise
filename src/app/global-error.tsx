"use client";
import { useEffect } from "react";

/**
 * The last resort: the page's own layout failed, so nothing from the app (styles, fonts) is available.
 * This replaces the whole document, so it carries its own html/body and plain inline styles.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const reference = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <html lang="en-IN">
      <body
        style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f4ee", color: "#0d1b30", fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        <main style={{ maxWidth: 440, padding: "32px 20px" }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5b6474" }}>OM ENTERPRISE</p>
          <h1 style={{ margin: "10px 0 0", fontSize: 28, lineHeight: 1.2 }}>The site didn&apos;t load</h1>
          <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "#5b6474" }}>This is usually a brief connection problem. Try again in a moment.</p>
          {reference && (
            <p style={{ margin: "16px 0 0", fontFamily: "monospace", fontSize: 12, color: "#5b6474" }}>
              Reference <span style={{ color: "#0d1b30" }}>{reference}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 22, padding: "11px 20px", border: 0, borderRadius: 6, background: "#0d1b30", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
