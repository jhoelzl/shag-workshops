#!/usr/bin/env node
/**
 * Export the /flyer/ page as pixel-perfect PDF and PNG using Playwright.
 *
 * Usage:
 *   npm run flyer:export                    # auto-starts astro dev if not running
 *   npm run flyer:export -- https://...    # custom URL (no auto-start)
 *
 */
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const customUrl = process.argv[2];
const url = customUrl || 'http://localhost:4321/flyer/';
const outDir = resolve(process.cwd(), 'dist-flyer');

await mkdir(outDir, { recursive: true });

// Helper: ping URL until it responds (or timeout)
async function waitForServer(target, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(1500) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let devServer = null;
if (!customUrl) {
  // Check if dev server is already running; otherwise start it
  const reachable = await fetch(url, { signal: AbortSignal.timeout(1000) })
    .then(() => true)
    .catch(() => false);

  if (!reachable) {
    console.log('→ Starting astro dev server...');
    devServer = spawn('npm', ['run', 'dev', '--', '--silent'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    devServer.stdout.on('data', () => {});
    devServer.stderr.on('data', () => {});

    const ready = await waitForServer(url, 30000);
    if (!ready) {
      console.error('✗ Astro dev server did not become ready within 30s');
      devServer.kill();
      process.exit(1);
    }
    console.log('✓ Dev server ready');
  }
}

console.log(`→ Loading ${url}`);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 600, height: 850 },
  deviceScaleFactor: 3,
});
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: 'networkidle' });

// Force screen styles (so PDF matches what is shown in the browser)
await page.emulateMedia({ media: 'screen' });

// Hide export-only overlays that should not appear in the final assets
await page.addStyleTag({
  content: `
    .print-hint,
    astro-dev-toolbar,
    #astro-dev-toolbar,
    [data-astro-dev-toolbar],
    [data-astro-source-file="/src/pages/flyer.astro"] astro-dev-toolbar {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
  `,
});

// Wait for fonts and images
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState('networkidle');

// Locate the flyer element and clip to it
const flyer = page.locator('.flyer');
await flyer.waitFor();
const box = await flyer.boundingBox();
if (!box) throw new Error('Flyer element not found');

const pngPath = resolve(outDir, 'shagadeus-flyer.png');
await page.screenshot({
  path: pngPath,
  clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  omitBackground: true,
});
console.log(`✓ PNG → ${pngPath}`);

// PDF: embed the exported PNG to guarantee pixel-identical output
const pdfPath = resolve(outDir, 'shagadeus-flyer.pdf');
const pdfPage = await context.newPage();
const pngBuffer = await readFile(pngPath);
const pngDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
await pdfPage.setContent(
  `<!doctype html>
  <html>
    <head>
      <style>
        @page { size: 148mm 210mm; margin: 0; }
        html, body { margin: 0; padding: 0; width: 148mm; height: 210mm; background: #fff; }
        img { width: 148mm; height: 210mm; display: block; }
      </style>
    </head>
    <body>
      <img src="${pngDataUrl}" alt="Flyer export" />
    </body>
  </html>`,
  { waitUntil: 'load' },
);

  await pdfPage.pdf({
    path: pdfPath,
    width: '148mm',
    height: '210mm',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await pdfPage.close();
  console.log(`✓ PDF → ${pdfPath}`);
} finally {
  await browser.close();
  if (devServer) {
    devServer.kill('SIGTERM');
  }
}
console.log('\nDone.');
