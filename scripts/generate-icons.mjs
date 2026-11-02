/**
 * Regenerates the you.ge icon family from the vector sources:
 *
 *   public/logo.svg        — bare Y monogram (alpha-traced by the ElectricLogo
 *                            effect on the homepage; must stay a clean
 *                            transparent silhouette)
 *   public/favicon.svg     — app icon: Y monogram on the dark rounded square
 *
 * Outputs (all derived from public/favicon.svg unless noted):
 *   public/favicon.ico                  (16/32/48, PNG payloads)
 *   public/favicon-16x16.png
 *   public/favicon-32x32.png
 *   public/apple-touch-icon.png         (180)
 *   public/android-chrome-192x192.png
 *   public/android-chrome-512x512.png
 *   public/pwa-maskable-512x512.png    (safe-zone padded)
 *
 * Run: npm run icons
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const renderPng = async (svgPath, size, outPath) => {
  const png = await renderPngBuffer(svgPath, size);
  await writeFile(outPath, png);
  console.log(`  ${outPath.replace(root + "/", "")}  (${size}x${size}, ${png.length} bytes)`);
};

const renderPngBuffer = async (svgPath, size) => {
  const svg = await readFile(svgPath, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return Buffer.from(resvg.render().asPng());
};

/** Minimal multi-size ICO writer (PNG payloads, Vista+ format). */
const writeIco = async (entries, outPath) => {
  const dirs = entries.map((entry) => ({
    width: Math.min(255, entry.dim),
    height: Math.min(255, entry.dim),
    colors: 0,
    reserved: 0,
    planes: 1,
    bpp: 32,
    size: entry.png.length,
    offset: 0,
  }));
  let offset = 6 + dirs.length * 16;
  for (const dir of dirs) {
    dir.offset = offset;
    offset += dir.size;
  }
  const buffers = [Buffer.alloc(6)];
  buffers[0].writeUInt16LE(0, 0); // reserved
  buffers[0].writeUInt16LE(1, 2); // type: ICO
  buffers[0].writeUInt16LE(dirs.length, 4);
  for (const dir of dirs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(dir.width, 0);
    entry.writeUInt8(dir.height, 1);
    entry.writeUInt8(dir.colors, 2);
    entry.writeUInt8(dir.reserved, 3);
    entry.writeUInt16LE(dir.planes, 4);
    entry.writeUInt16LE(dir.bpp, 6);
    entry.writeUInt32LE(dir.size, 8);
    entry.writeUInt32LE(dir.offset, 12);
    buffers.push(entry);
  }
  for (const { png } of entries) buffers.push(png);
  await writeFile(outPath, Buffer.concat(buffers));
  console.log(`  ${outPath.replace(root + "/", "")}  (${dirs.length} images, ${dirs.map((d) => d.width).join("/")}px)`);
};

const main = async () => {
  await mkdir(publicDir, { recursive: true });
  const faviconSvg = join(publicDir, "favicon.svg");

  console.log("Rendering PNGs from public/favicon.svg:");
  const pngs = {};
  const outputs = [
    { size: 16, file: "favicon-16x16.png" },
    { size: 32, file: "favicon-32x32.png" },
    { size: 48, file: null }, // ICO-only
    { size: 180, file: "apple-touch-icon.png" },
    { size: 192, file: "android-chrome-192x192.png" },
    { size: 512, file: "android-chrome-512x512.png" },
  ];
  for (const { size, file } of outputs) {
    if (file) {
      const out = join(publicDir, file);
      await renderPng(faviconSvg, size, out);
      pngs[size] = await readFile(out);
    } else {
      pngs[size] = await renderPngBuffer(faviconSvg, size);
    }
  }
  await renderPng(faviconSvg, 512, join(publicDir, "pwa-maskable-512x512.png"));

  console.log("Writing public/favicon.ico:");
  await writeIco(
    [
      { dim: 16, png: pngs[16] },
      { dim: 32, png: pngs[32] },
      { dim: 48, png: pngs[48] },
    ],
    join(publicDir, "favicon.ico"),
  );
};

await main();
