import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, chromium, type BrowserContext } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const extensionPath = path.join(projectRoot, 'dist');

async function openExtensionPopup(context: BrowserContext) {
  let serviceWorker = context.serviceWorkers()[0];

  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/app/entrypoints/popup/index.html`);
  await page.evaluate(() =>
    chrome.storage.local.set({
      authConfig: {
        mode: 'remote',
        apiBaseUrl: 'http://localhost:8080',
        loginPath: '/api/auth/login',
        csrfPath: '/api/auth/csrf',
      },
      authSession: {
        user: {
          email: 'admin@gmail.com',
          displayName: 'Admin',
        },
        authenticatedAt: new Date().toISOString(),
        mode: 'remote',
        apiBaseUrl: 'http://localhost:8080',
        csrfToken: 'csrf-token',
        accessToken: 'access-token',
        tokenType: 'Bearer',
      },
    }),
  );
  await page.reload();

  return page;
}

test('ABRS popup keeps one-by-one workbook attachments stacked by slot', async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const page = await openExtensionPopup(context);
    await expect(page.getByRole('heading', { name: 'ABRS 장부 업로드' })).toBeVisible();
    await page.getByLabel('장부 날짜').fill('2026-04-18');

    for (const workbook of [
      'inventory_health_sku_info_20260616220816.xlsx',
      'Statistics-20260418~20260418_(0).xlsx',
      'A01549099-dailySettlement-20260418-20260418.xlsx',
    ]) {
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '파일 추가' }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: workbook,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('xlsx'),
      });
    }

    await expect(page.getByText('inventory_health_sku_info_20260616220816.xlsx')).toBeVisible();
    await expect(page.getByText('Statistics-20260418~20260418_(0).xlsx')).toBeVisible();
    await expect(page.getByText('A01549099-dailySettlement-20260418-20260418.xlsx')).toBeVisible();
    await expect(page.getByRole('button', { name: '서버 업로드' })).toBeEnabled();
  } finally {
    await context.close();
  }
});
