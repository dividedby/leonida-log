// Renders the PWA icons in public/icons/ from app/icon.svg (the LOGO.A mark in
// docs/branding.md). Run by hand after changing the logo: `node scripts/make-icons.mjs`.
// The PNGs are committed; the build never runs this.
//
//   icon-192, icon-512            the logo as is (rounded tile, transparent corners)
//   icon-180                      apple-touch-icon: full bleed, iOS rounds it itself
//   icon-maskable-512             full bleed, art scaled to 80% so the OS mask
//                                 (safe zone: a circle of 40% of the width) never crops it
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const logo = readFileSync(new URL("app/icon.svg", root), "utf8");

// Sun, wave, trunk and leaves are reused from icon.svg; the sea and the wave
// are redrawn wider so a full-bleed canvas has no gap at the sides.
const [sun, , trunk, leaves] = logo.match(/<(?:circle|path)\b[^>]*\/>/g);
const sea = '<rect x="-60" y="40" width="180" height="80" fill="#0f8b8d"/>';
const wave =
  '<path d="M-60 44c7 0 7-2 15-2s8 2 15 2 8-2 15-2 8 2 15 2 8-2 15-2 8 2 15 2 8-2 15-2 8 2 15 2 8-2 15-2 8 2 15 2V120H-60z" fill="#0b6f71"/>';

function bleed(scale) {
  return (
    '<svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="-60" y="-60" width="180" height="180" fill="#e5336d"/>' +
    `<g transform="translate(30 30) scale(${scale}) translate(-30 -30)">${sun}${sea}${wave}${trunk}${leaves}</g></svg>`
  );
}

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
}

const out = new URL("public/icons/", root);
mkdirSync(out, { recursive: true });
const files = {
  "icon-192.png": png(logo, 192),
  "icon-512.png": png(logo, 512),
  "icon-180.png": png(bleed(1), 180),
  "icon-maskable-512.png": png(bleed(0.8), 512),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, out), data);
  console.log(`wrote ${fileURLToPath(new URL(name, out))}`);
}
