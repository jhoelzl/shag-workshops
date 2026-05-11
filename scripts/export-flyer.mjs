#!/usr/bin/env node
/**
 * Export the /flyer1/ page as pixel-perfect PDF and PNG using Playwright.
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

const urls = [
  'http://localhost:4321/flyer1/',
  'http://localhost:4321/flyer2/',
  'http://localhost:4321/flyer3/'
];

const customUrl = process.argv[2];
const url = customUrl || urls[0];
const outDir = resolve(process.cwd(), 'dist-flyer');
const routeSegment = (() => {
  try {
    const { pathname } = new URL(url);
    const segment = pathname.split('/').filter(Boolean)[0] || 'flyer1';
    return segment.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'flyer1';
  } catch {
    return 'flyer1';
  }
})();
const fileSuffix = routeSegment === 'flyer1' ? '' : `-${routeSegment}`;

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
  const reachable = await fetch(urls[0], { signal: AbortSignal.timeout(1000) })
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

    const ready = await waitForServer(urls[0], 30000);
    if (!ready) {
      console.error('✗ Astro dev server did not become ready within 30s');
      devServer.kill();
      process.exit(1);
    }
    console.log('✓ Dev server ready');
  }
}

for (const [index, flyerUrl] of urls.entries()) {
  console.log(`→ Loading ${flyerUrl}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 600, height: 850 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();

  try {
    await page.goto(flyerUrl, { waitUntil: 'networkidle' });
    const pdfPath = `${outDir}/flyer${index + 1}.pdf`;
    const pngPath = `${outDir}/flyer${index + 1}.png`;

    console.log(`→ Exporting PDF to ${pdfPath}`);
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });

    console.log(`→ Exporting PNG to ${pngPath}`);
    await page.screenshot({ path: pngPath });
  } catch (err) {
    console.error(`✗ Failed to export ${flyerUrl}:`, err);
  } finally {
    await browser.close();
  }
}

if (devServer) {
  devServer.kill();
}
console.log('\nDone.');
