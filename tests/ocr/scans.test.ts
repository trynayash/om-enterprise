import { describe, expect, it } from "vitest";
import { CANCELLED, readImportFile, type ReadProgress } from "@/lib/import-files";
import { suspectPrices } from "@/lib/import-files/mapping";
import { compareToExcel, fixture, importRowsOf, nodeReadOptions, readFixture } from "./helpers";

/**
 * Scanned files, read with the real text recognition engine (Tesseract). The scans are pictures of
 * the same invented price list as the other import fixtures, so what comes out is compared with
 * the Excel file's rows. Recognition can slip on a character, so a few rows may differ in a size
 * or a space; prices and codes must be right.
 */
const truth = async () => importRowsOf((await readFixture("pricelist.xlsx")).tables).rows;

describe("scanned files", () => {
  it("a two-page scanned PDF (the second page crooked and shifted) gives the Excel file's rows", async () => {
    const progress: ReadProgress[] = [];
    const read = await readFixture("scan-two-pages.pdf", { onProgress: (p) => progress.push(p) });
    expect(read.kind).toBe("pdf");
    expect(read.scanned).toBe(true);
    expect(read.confidence).toBeGreaterThan(80);
    expect(read.tables.map((t) => t.name)).toEqual(["All pages", "Page 1", "Page 2"]);
    expect(progress).toContainEqual({ stage: "scan", done: 2, total: 2 });

    const got = importRowsOf(read.tables);
    expect(got.columns).toMatchObject({ sku: 1, product_name: 2, variant: 3, mrp: 4, purchase_cost: 5 });
    const { known, exact, misses } = compareToExcel(got.rows, await truth());
    expect(got.rows).toHaveLength(47);
    expect(known, misses.join("\n")).toBe(47);
    expect(exact, misses.join("\n")).toBeGreaterThanOrEqual(43);
  });

  it("a phone-style photo (tilted, uneven light, JPEG) is straightened and read", async () => {
    const read = await readFixture("scan-photo.jpg");
    expect(read).toMatchObject({ kind: "picture", scanned: true });
    const got = importRowsOf(read.tables);
    const { known, exact, misses } = compareToExcel(got.rows, await truth());
    expect(known, misses.join("\n")).toBeGreaterThanOrEqual(17);
    expect(exact, misses.join("\n")).toBeGreaterThanOrEqual(14);
    // Whatever the engine misread, a price that no longer fits its neighbours is marked for a second look.
    const marked = new Set(suspectPrices(got.rows).map((c) => got.rows[c.index].sku));
    for (const r of got.rows) {
      const t = (await truth()).find((x) => x.sku === r.sku);
      if (t && (t.mrp !== r.mrp || t.purchase_cost !== r.purchase_cost) && Math.abs(Math.log10(Number(r.mrp || 1) / Number(t.mrp || 1))) > 0.5)
        expect(marked.has(r.sku), `${r.sku} ${r.mrp} (should be ${t.mrp})`).toBe(true);
    }
  });

  it("a photo with a strong shadow across it is evened out before it is read", async () => {
    const read = await readFixture("scan-shadow.jpg");
    const got = importRowsOf(read.tables);
    const { known, exact, misses } = compareToExcel(got.rows, await truth());
    expect(known, misses.join("\n")).toBeGreaterThanOrEqual(17);
    expect(exact, misses.join("\n")).toBeGreaterThanOrEqual(13);
  });

  it("a page scanned sideways is turned upright", async () => {
    const read = await readFixture("scan-sideways.jpg");
    expect(read.scanned).toBe(true);
    const got = importRowsOf(read.tables);
    expect(got.header.slice(0, 3)).toEqual(expect.arrayContaining(["Item Code"]));
    const { known, exact, misses } = compareToExcel(got.rows, await truth());
    expect(known, misses.join("\n")).toBeGreaterThanOrEqual(17);
    expect(exact, misses.join("\n")).toBeGreaterThanOrEqual(15);
  });

  it("a scan of a table without borders: product headings, wrapped descriptions", async () => {
    const read = await readFixture("scan-catalogue.jpg");
    const got = importRowsOf(read.tables);
    const rows = got.rows;
    expect(new Set(rows.map((r) => r.product_name)).size).toBeGreaterThanOrEqual(2);
    const first = rows.find((r) => r.sku === "PVC-001");
    expect(first).toMatchObject({ product_name: "uPVC Column Pipe", mrp: "100", purchase_cost: "" });
    expect(first?.description).toMatch(/ISI marked, UV stabilised/);
    // Prices rise by 37.50 a size: every row's MRP is one of the list's values.
    const mrp = (code: string) => rows.find((r) => r.sku === code)?.mrp;
    expect(mrp("PVC-006")).toBe("287.5");
    expect(mrp("SWR-003")).toBe("230");
  });

  it("can be cancelled in the middle of reading a page, and stops at once", async () => {
    const stop = new AbortController();
    const started = readImportFile("scan-two-pages.pdf", fixture("scan-two-pages.pdf"), nodeReadOptions({ signal: stop.signal }));
    // Long enough for the engine to be busy with the first page.
    await new Promise((r) => setTimeout(r, 5000));
    const stoppedAt = Date.now();
    stop.abort();
    await expect(started).rejects.toThrow(CANCELLED);
    expect(Date.now() - stoppedAt).toBeLessThan(2000);
  });

  it("can be cancelled between pages, and nothing is left running", async () => {
    const stop = new AbortController();
    const started = readImportFile(
      "scan-two-pages.pdf",
      fixture("scan-two-pages.pdf"),
      nodeReadOptions({
        signal: stop.signal,
        onProgress: (p) => {
          if (p.stage === "scan") stop.abort();
        },
      }),
    );
    await expect(started).rejects.toThrow();
    expect(stop.signal.aborted).toBe(true);
    // The message is the one the page treats as "the person cancelled".
    await started.catch((e: Error) => expect([CANCELLED, "Cancelled"].some((m) => e.message.includes(m)) || /terminated|abort/i.test(e.message)).toBe(true));
  });
});
