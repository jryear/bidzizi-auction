#!/usr/bin/env node
// Composes labelled side-by-side comparison images from screenshot files.
//   node tests/v1/compose-compare.mjs <spec.json> <out-dir>
// spec: [{ "name": "cmp-items-390", "title": "...", "width": 390, "cols": [{ "label": "...", "src": "/abs/path.png" }] }]
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(await readFile(specPath, "utf8"));
await mkdir(out, { recursive: true });
const dir = await mkdtemp(path.join(tmpdir(), "bz-compose-"));
const browser = await chromium.launch();
for (const s of spec) {
  const w = s.width ?? 390, cols = s.cols;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#E7E1D4;font:500 15px/1.3 -apple-system,system-ui,sans-serif;color:#1A1814}
    .wrap{display:inline-flex;gap:22px;padding:56px 24px 24px;align-items:flex-start;position:relative}
    h1{position:absolute;left:24px;top:14px;margin:0;font:600 20px/1.2 Georgia,serif}
    figure{margin:0;width:${w}px} figcaption{margin-bottom:8px;font-weight:650} figcaption small{display:block;font-weight:500;color:#6A6355}
    img{display:block;width:${w}px;border-radius:${w > 600 ? 10 : 18}px;box-shadow:0 10px 30px -14px rgba(0,0,0,.45);background:#fff}
    figure.new figcaption{color:#2338C7}
  </style><div class="wrap"><h1>${s.title}</h1>${cols.map((c, i) => `<figure class="${i === cols.length - 1 ? "new" : ""}"><figcaption>${c.label}${c.note ? `<small>${c.note}</small>` : ""}</figcaption><img src="file://${c.src}"></figure>`).join("")}</div>`;
  const file = path.join(dir, `${s.name}.html`);
  await writeFile(file, html);
  const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: s.scale ?? 1 });
  await page.goto(`file://${file}`); await page.waitForLoadState("load");
  const box = await page.locator(".wrap").boundingBox();
  await page.screenshot({ path: path.join(out, `${s.name}.jpg`), type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) }, fullPage: true });
  await page.close();
  console.log("composed", s.name);
}
await browser.close();
