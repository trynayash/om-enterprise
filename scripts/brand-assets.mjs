/**
 * Makes the logo files the app uses from the shop's logo (assets/brand/om-enterprise-logo-source.jpg):
 * the round badge cut out of its black square, with transparent corners.
 *   node scripts/brand-assets.mjs
 * Outputs (committed):
 *   public/brand/om-enterprise-logo.png   512 px, for the website, POS and dashboard
 *   assets/brand/om-enterprise-logo.jpg   360 px on white, drawn on bill PDFs (small: every PDF carries it)
 *   src/app/icon.png                      128 px, the browser tab icon
 *   src/app/apple-icon.png                180 px on white, for phone home screens (iOS shows no transparency)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "assets/brand/om-enterprise-logo-source.jpg");

// The badge fills the square; its edge is 623 px from the centre of the 1254 px source.
const meta = await sharp(source).metadata();
const size = meta.width;
const radius = size * (622.5 / 1254);
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="#fff"/></svg>`);
const round = await sharp(source)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

for (const [file, px] of [
  ["public/brand/om-enterprise-logo.png", 512],
  ["src/app/icon.png", 128],
]) {
  await sharp(round).resize(px, px).png({ compressionLevel: 9 }).toFile(path.join(root, file));
}
await sharp(round).resize(360, 360).flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(root, "assets/brand/om-enterprise-logo.jpg"));
await sharp(round)
  .resize(164, 164)
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#ffffff" })
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "src/app/apple-icon.png"));
console.log("brand assets written");
