import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expect,
  test,
  chromium,
  type BrowserContext,
  type Route,
} from '@playwright/test';

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

async function attachAbrsWorkbooks(page: Awaited<ReturnType<typeof openExtensionPopup>>) {
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

    await attachAbrsWorkbooks(page);

    await expect(page.getByText('inventory_health_sku_info_20260616220816.xlsx')).toBeVisible();
    await expect(page.getByText('Statistics-20260418~20260418_(0).xlsx')).toBeVisible();
    await expect(page.getByText('A01549099-dailySettlement-20260418-20260418.xlsx')).toBeVisible();
    await expect(page.getByRole('button', { name: '서버 업로드' })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test('ABRS popup hides missing-file validation after successful server upload clears the cache', async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath('upload-profile'),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );

  const fulfillUpload = (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'LEDGER-TEST' }),
    });

  await context.route('http://localhost:8080/api/ledger/imports', fulfillUpload);
  await context.route('https://zephlyglobal.com/api/ledger/imports', fulfillUpload);

  try {
    const page = await openExtensionPopup(context);
    await expect(page.getByRole('heading', { name: 'ABRS 장부 업로드' })).toBeVisible();
    await page.getByLabel('장부 날짜').fill('2026-04-18');
    await attachAbrsWorkbooks(page);

    await page.getByRole('button', { name: '서버 업로드' }).click();

    await expect(page.getByText('업로드 완료')).toBeVisible();
    await expect(page.getByText('확인 필요')).toHaveCount(0);
    await expect(
      page.getByText('재고 현황 파일을 추가해주세요. 판매 현황 파일을 추가해주세요. 광고비/정산 파일을 추가해주세요.'),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('ABRS popup restores cached workbook attachments after popup remount', async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath('persistent-profile'),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(firstPopup.getByRole('heading', { name: 'ABRS 장부 업로드' })).toBeVisible();
    await firstPopup.getByLabel('장부 날짜').fill('2026-04-18');

    const chooserPromise = firstPopup.waitForEvent('filechooser');
    await firstPopup.getByRole('button', { name: '파일 추가' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'inventory_health_sku_info_20260616220816.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('xlsx'),
    });
    await expect(
      firstPopup.getByText('inventory_health_sku_info_20260616220816.xlsx'),
    ).toBeVisible();
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(secondPopup.getByLabel('장부 날짜')).toHaveValue('2026-04-18');
    await expect(
      secondPopup.getByText('inventory_health_sku_info_20260616220816.xlsx'),
    ).toBeVisible();

    await secondPopup.getByRole('button', { name: '비우기' }).click();
    await expect(
      secondPopup.getByText('inventory_health_sku_info_20260616220816.xlsx'),
    ).toHaveCount(0);
    await secondPopup.close();

    const thirdPopup = await openExtensionPopup(context);
    await expect(thirdPopup.getByLabel('장부 날짜')).toHaveValue('2026-04-18');
    await expect(
      thirdPopup.getByText('inventory_health_sku_info_20260616220816.xlsx'),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('ABRS popup restores the selected ledger date after losing foreground', async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath('selected-date-profile'),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(firstPopup.getByRole('heading', { name: 'ABRS 장부 업로드' })).toBeVisible();
    await firstPopup.getByLabel('장부 날짜').fill('2026-04-18');
    await expect(firstPopup.getByLabel('장부 날짜')).toHaveValue('2026-04-18');

    const otherPage = await context.newPage();
    await otherPage.goto('https://example.com');
    await otherPage.bringToFront();
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(secondPopup.getByLabel('장부 날짜')).toHaveValue('2026-04-18');
  } finally {
    await context.close();
  }
});
