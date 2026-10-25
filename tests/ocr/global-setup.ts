import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** The recognition engine and its English, Hindi and Gujarati data are copied into public/ocr/ (not committed), as before `next dev`. */
export default function setup() {
  execFileSync(process.execPath, [join(__dirname, "../../scripts/copy-engine-files.mjs")], { stdio: "inherit" });
}
