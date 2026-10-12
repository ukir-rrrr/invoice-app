import { test, expect } from '@playwright/test';
import path from 'path';

const artifacts = '/opt/cursor/artifacts';

async function seedAndOpenHome(page: import('@playwright/test').Page, scenario: string) {
  await page.goto('/');
  await page.waitForFunction(
    () => typeof window.__INVOICE_E2E__ !== 'undefined' && window.__DB_READY__ === true,
    null,
    { timeout: 60_000 },
  );
  await page.evaluate(async (s) => {
    await window.__INVOICE_E2E__?.seed(s as 'empty' | 'normal' | 'backup-warning');
  }, scenario);
}

test.describe('ホーム画面', () => {
  test('通常状態のスクリーンショット', async ({ page }) => {
    await seedAndOpenHome(page, 'normal');
    await expect(page.getByTestId('backup-chip')).toContainText('バックアップ済', {
      timeout: 60_000,
    });
    await page.screenshot({ path: path.join(artifacts, 'home-normal.png'), fullPage: true });
  });

  test('空状態のスクリーンショット', async ({ page }) => {
    await seedAndOpenHome(page, 'empty');
    await expect(page.getByTestId('home-empty-message')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(artifacts, 'home-empty.png'), fullPage: true });
  });

  test('バックアップ警告状態のスクリーンショット', async ({ page }) => {
    await seedAndOpenHome(page, 'backup-warning');
    await expect(page.getByTestId('backup-chip')).toContainText('保存先が未設定', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('home-business-name')).toContainText('青葉デザイン工房');
    await page.screenshot({
      path: path.join(artifacts, 'home-backup-warning.png'),
      fullPage: true,
    });
  });
});
