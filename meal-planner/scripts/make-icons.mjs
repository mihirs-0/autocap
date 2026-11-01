// Makes the PNG app icons from an SVG drawing, using the Playwright browser.
// Run once with: npm run icons
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#2f6f4f"/>
  <circle cx="50" cy="52" r="26" fill="#f6f5f1"/>
  <circle cx="50" cy="52" r="18" fill="none" stroke="#2f6f4f" stroke-width="2.5" opacity="0.35"/>
  <g stroke="#f6f5f1" stroke-width="3.2" stroke-linecap="round" fill="none">
    <path d="M14 30v14M10 30v10a4 4 0 0 0 8 0V30M14 44v32"/>
    <path d="M86 30c-5 4-6 12-6 18h6M86 30v46"/>
  </g>
</svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(size)}</body>`);
  await page.screenshot({ path: join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written to', out);
