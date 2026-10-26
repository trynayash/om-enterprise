/**
 * Makes the logo files the app uses from the shop's logo (assets/brand/om-enterprise-logo-source.jpg):
 * the round badge cut out of its black square, with transparent corners.
 *   node scripts/brand-assets.mjs
 * Outputs (committed):
 *   public/brand/om-enterprise-logo.png        full size (1254 px), the source of every logo on the site; pages
 *                                              get small copies from the image optimiser, the bill page a sharp large one
 *   public/brand/om-enterprise-logo-email.png  144 px, for the top of bill emails (mail apps download it as is)
 *   assets/brand/om-enterprise-logo.jpg        full size on white, drawn on bill PDFs so they print sharp at any size
 *   src/app/icon.png                           128 px, the browser tab icon
 *   src/app/apple-icon.png                     180 px on white, for phone home screens (iOS shows no transparency)
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

await sharp(round).png({ compressionLevel: 9 }).toFile(path.join(root, "public/brand/om-enterprise-logo.png"));
await sharp(round).resize(144, 144).png({ compressionLevel: 9 }).toFile(path.join(root, "public/brand/om-enterprise-logo-email.png"));
await sharp(round).resize(128, 128).png({ compressionLevel: 9 }).toFile(path.join(root, "src/app/icon.png"));
await sharp(round).flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(path.join(root, "assets/brand/om-enterprise-logo.jpg"));
await sharp(round)
  .resize(164, 164)
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#ffffff" })
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "src/app/apple-icon.png"));
console.log("brand assets written");
