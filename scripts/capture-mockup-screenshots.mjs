import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const htmlPath = path.join(root, 'mockup.html');
const outDir = '/opt/cursor/artifacts';

const screens = [
  ['01-home', 'screen-01-home'],
  ['02-home-backup-warning', 'screen-02-home-backup-warning'],
  ['03-home-empty', 'screen-03-home-empty'],
  ['04-documents', 'screen-04-documents'],
  ['05-editor-invoice', 'screen-05-editor-invoice'],
  ['06-editor-a4-blocked', 'screen-06-editor-a4-blocked'],
  ['07-pdf-preview', 'screen-07-pdf-preview'],
  ['08-pdf-preview-blocked', 'screen-08-pdf-preview-blocked'],
  ['09-clients', 'screen-09-clients'],
  ['10-items', 'screen-10-items'],
  ['11-settings', 'screen-11-settings'],
  ['12-issuer-profile', 'screen-12-issuer-profile'],
  ['13-backup', 'screen-13-backup'],
  ['14-restore', 'screen-14-restore'],
  ['15-restore-error', 'screen-15-restore-error'],
  ['16-setup-issuer', 'screen-16-setup-issuer'],
  ['17-setup-backup', 'screen-17-setup-backup'],
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 900 });
await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });

for (const [name, id] of screens) {
  const locator = page.locator(`#${id} .phone`);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const outPath = path.join(outDir, `${name}.png`);
  await locator.screenshot({ path: outPath });
  console.log(outPath);
}

await browser.close();
