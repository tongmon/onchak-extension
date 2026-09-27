import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const extensionPath = path.resolve(process.env.EXTENSION_DIST_DIR || 'dist');
const webOrigin = process.env.REGISTRATION_WEB_ORIGIN || 'https://zephlyglobal.com';
const registrationUrl = new URL('/registration', webOrigin).href;

for (const surface of ['popup', 'options']) {
  test(`${surface} account creation opens the web registration page and survives refresh`, async ({}, testInfo) => {
    const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    context.on('page', (page) => {
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
    });

    try {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const extensionId = new URL(worker.url()).host;
      const extensionPage = await context.newPage();
      await extensionPage.goto(`chrome-extension://${extensionId}/src/app/entrypoints/${surface}/index.html`);

      const link = extensionPage.getByRole('link', { name: '계정 생성', exact: true });
      await expect(link).toHaveAttribute('href', registrationUrl);
      const newPage = context.waitForEvent('page');
      await link.click();
      const registrationPage = await newPage;
      await registrationPage.waitForLoadState('domcontentloaded');
      await expect(registrationPage).toHaveURL(registrationUrl);
      await expect(registrationPage.getByText('회원가입', { exact: true })).toBeVisible();
      await registrationPage.screenshot({ path: testInfo.outputPath('registration.png'), fullPage: true });

      const refreshed = await registrationPage.reload();
      expect(refreshed?.status()).toBe(200);
      await expect(registrationPage.getByText('회원가입', { exact: true })).toBeVisible();
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      await testInfo.attach('browser-errors', {
        body: JSON.stringify({ pageErrors, consoleErrors }),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
}
