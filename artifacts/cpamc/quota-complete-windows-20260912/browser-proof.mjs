import { chromium } from '/home/david/.npm/_npx/a5b920f00216d246/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = new URL('./', import.meta.url);
const browser = await chromium.launch({ headless: true, executablePath: '/home/david/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Tokyo' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto('http://127.0.0.1:5173/artifacts/cpamc/quota-complete-windows-20260912/proof.html');
  await page.locator('[data-timeline-lane]').first().waitFor();
  const inspect = () => page.evaluate(() => {
    const section = document.querySelector('[data-span-start-ms]');
    const start = Number(section.dataset.spanStartMs), end = Number(section.dataset.spanEndMs);
    const lanes = [...document.querySelectorAll('[data-timeline-lane]')].map((lane) => {
      const bar = lane.querySelector('[data-window-state="live"]');
      return { name: lane.dataset.timelineLane, start: Number(bar?.dataset.windowStartMs), end: Number(bar?.dataset.windowEndMs), full: !!bar && Number(bar.dataset.windowStartMs) >= start && Number(bar.dataset.windowEndMs) <= end };
    });
    return { start, end, lanes };
  });
  const initial = await inspect();
  assert.equal(initial.lanes.length, 8);
  assert(initial.lanes.filter((lane) => lane.name !== 'Cursor').every((lane) => lane.full));
  assert((await page.locator('[data-timeline-lane="Codex"]').innerText()).includes('09/19 05:30'));
  await page.screenshot({ path: new URL('desktop.png', out).pathname, fullPage: true });
  await writeFile(new URL('rendered.html', out), await page.content());
  const slider = page.getByRole('slider');
  await slider.fill('3');
  assert.equal(await page.locator('[data-timeline-lane="Codex"] [data-next-reset-ms]').getAttribute('data-next-reset-ms'), '1789813833000');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  assert.deepEqual(await inspect(), initial);
  await page.getByRole('button', { name: '5-hour', exact: true }).click();
  const session = await inspect();
  assert.equal(session.lanes.length, 2);
  assert(session.lanes.every((lane) => lane.full && lane.end - lane.start === 5 * 3600000));
  await page.getByRole('button', { name: 'Weekly', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL('mobile.png', out).pathname, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'page must not overflow; chart scrolls internally');
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-results.json', out), JSON.stringify({ browser: 'local headless Chromium', timezone: 'Asia/Tokyo', initial, session, consoleErrors: errors, mobilePageOverflow: overflow, zoomRestore: 'passed' }, null, 2));
  console.log('Browser proof: 8 tools; 7 complete windows + Cursor exception; zoom/Today/session/mobile passed; 0 console errors.');
} finally { await browser.close(); }
