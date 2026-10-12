import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const htmlPath = path.join(root, 'mockup.html');
const outDir = '/opt/cursor/artifacts';

const screens = [
  { id: 'screen-home', file: '01-home.png' },
  { id: 'screen-documents', file: '02-documents.png' },
  { id: 'screen-editor', file: '03-editor-invoice.png' },
  { id: 'screen-pdf-preview', file: '04-pdf-preview.png' },
  { id: 'screen-pdf-blocked', file: '05-pdf-blocked.png' },
  { id: 'screen-clients', file: '06-clients.png' },
  { id: 'screen-items', file: '07-items.png' },
  { id: 'screen-settings', file: '08-settings.png' },
  { id: 'screen-backup', file: '09-backup.png' },
  { id: 'screen-restore', file: '10-restore.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 500, height: 920 },
  deviceScaleFactor: 2,
});

await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });

for (const { id, file } of screens) {
  const locator = page.locator(`#${id} .phone`);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await locator.screenshot({ path: path.join(outDir, file) });
  console.log('wrote', file);
}

await browser.close();
