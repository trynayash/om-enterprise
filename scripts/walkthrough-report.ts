/**
 * After `playwright test -c playwright.walkthrough.config.ts`: convert every recording to MP4 and
 * write walkthrough-output/REPORT.md — one row per video and every check with ✅ / ❌.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

type Check = { label: string; ok: boolean; error?: string; page: string };
type Result = { video: string; title: string; project: string; outputDir: string; checks: Check[] };

const OUT = path.resolve("walkthrough-output");
const VIDEOS = path.join(OUT, "videos");
mkdirSync(VIDEOS, { recursive: true });

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

function webmsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const main = path.join(dir, "video.webm");
  const extra = path.join(dir, "second-window");
  const extras = existsSync(extra)
    ? readdirSync(extra)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => path.join(extra, f))
        .sort((a, b) => statSync(a).birthtimeMs - statSync(b).birthtimeMs)
    : [];
  const more = readdirSync(dir)
    .filter((f) => /^video-\d+\.webm$/.test(f))
    .map((f) => path.join(dir, f));
  return [...(existsSync(main) ? [main] : []), ...more, ...extras];
}

function toMp4(src: string, dest: string) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", dest]);
  const secs = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dest]).toString().trim());
  return { secs, mb: statSync(dest).size / 1_048_576 };
}

const resultsDir = path.join(OUT, "results");
const results: Result[] = existsSync(resultsDir)
  ? readdirSync(resultsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(resultsDir, f), "utf8")) as Result)
      .sort((a, b) => a.video.localeCompare(b.video, "en", { numeric: true }))
  : [];

const rows: string[] = [];
const details: string[] = [];
let total = 0;
let passed = 0;
for (const r of results) {
  const files = webmsIn(r.outputDir).map((src, i) => {
    const name = `${r.video}${i ? String.fromCharCode(97 + i) : ""}-${slug(r.title)}.mp4`;
    const { secs, mb } = toMp4(src, path.join(VIDEOS, name));
    return { name, secs, mb };
  });
  const ok = r.checks.filter((c) => c.ok).length;
  total += r.checks.length;
  passed += ok;
  const status = ok === r.checks.length ? "✅ All passed" : `❌ ${r.checks.length - ok} failed`;
  const length = files.map((f) => `${Math.round(f.secs)}s`).join(" + ");
  rows.push(`| ${r.video} | ${r.title} | ${r.project} | ${ok}/${r.checks.length} | ${status} | ${files.map((f) => `\`${f.name}\``).join("<br>")} | ${length} |`);
  details.push(
    `### ${r.video} · ${r.title}\n\n${files.map((f) => `- Video: \`videos/${f.name}\` (${Math.round(f.secs)} s, ${f.mb.toFixed(1)} MB)`).join("\n")}\n\n` +
      r.checks.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.label}${c.ok ? "" : ` — **${(c.error ?? "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\|/g, "/")}**`}`).join("\n"),
  );
}

const report = `# OM ENTERPRISE — recorded walkthrough

Recorded ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST against a production build and a throwaway database (sample products, a clearly-labelled TEST item, test GSTIN and UPI ID).

**${passed} of ${total} checks passed across ${results.length} videos.**

| # | Video | Device | Checks | Result | File(s) | Length |
|---|---|---|---|---|---|---|
${rows.join("\n")}

## Every check

${details.join("\n\n")}
`;
writeFileSync(path.join(OUT, "REPORT.md"), report);
console.log(`${passed}/${total} checks passed · ${results.length} videos · report: ${path.join(OUT, "REPORT.md")}`);
