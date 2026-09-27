import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";
import { createPopupMarginCalculationResult } from "../../src/pages/popup-home/model/popup-margin-result";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(readFileSync(path.join(projectRoot, "tests/fixtures/scrum297-input.json"), "utf8"));

test("SCRUM-297 built popup preserves upload data and opens the saved record", async ({}, testInfo) => {
  const extensionPath = path.join(projectRoot, "dist");
  const apiBaseUrl = "https://zephlyglobal.com";
  const recordId = "MR-29700000000040008000000000000001";
  const result = {
    ...createPopupMarginCalculationResult(fixture),
    clientResultId: "29700000-0000-4000-8000-000000000001",
    capturedAt: "2026-09-27T00:00:00Z",
  };
  const expected = { source: "onchak-extension-popup", capturedAt: result.capturedAt, result };
  const pendingKey = `pendingMarginResult:account:${encodeURIComponent(`${apiBaseUrl}|admin@gmail.com`)}`;
  const context = await chromium.launchPersistentContext(testInfo.outputPath("profile"), {
    headless: false,
    viewport: { width: 420, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      // All API responses below are fixtures; block DNS access to production as well.
      "--host-resolver-rules=MAP zephlyglobal.com 127.0.0.1",
    ],
  });
  const uploads: unknown[] = [];
  const errors: string[] = [];
  const unexpectedRequests: string[] = [];
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    if (request.url() === `${apiBaseUrl}/api/auth/me`) {
      await route.fulfill({ json: { authenticated: true } });
    } else if (request.url() === `${apiBaseUrl}/api/margin-results` && request.method() === "POST") {
      uploads.push(request.postDataJSON());
      await route.fulfill({ json: { status: "RECEIVED", id: recordId } });
    } else {
      unexpectedRequests.push(request.url());
      await route.abort();
    }
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/src/app/entrypoints/popup/index.html`);
    await expect(page.getByRole("button", { name: "로그인", exact: true }).first()).toBeVisible();
    await page.evaluate(async ({ apiBaseUrl, pendingKey, result }) => {
      await chrome.storage.local.set({
        authConfig: { mode: "remote", apiBaseUrl, loginPath: "/api/auth/login", csrfPath: "/api/auth/csrf" },
        authSession: {
          user: { email: "admin@gmail.com", displayName: "Admin" },
          authenticatedAt: new Date().toISOString(),
          mode: "remote", apiBaseUrl, csrfToken: "fixture-csrf", accessToken: "fixture-token", tokenType: "Bearer",
        },
        [pendingKey]: result,
      });
    }, { apiBaseUrl, pendingKey, result });
    await page.reload();
    await expect(page.getByText("접이식 수납함 32L", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "결과 서버 업로드", exact: true }).click();
    const reviewLink = page.getByRole("link", { name: "저장한 기록으로 마진 계산기 열기" });
    const expectedLink = `${apiBaseUrl}/app/margin-results?marginResultId=${recordId}`;
    await expect(reviewLink).toHaveAttribute("href", expectedLink);
    await expect(page.getByRole("button", { name: "결과 서버 업로드", exact: true })).toBeDisabled();
    expect(uploads).toEqual([expected]);
    expect(await page.evaluate(async (key) => (await chrome.storage.local.get(key))[key] ?? null, pendingKey)).toBeNull();
    expect(errors).toEqual([]);
    expect(unexpectedRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("extension-upload.png"), fullPage: true });
    writeFileSync(testInfo.outputPath("expected-actual.json"), JSON.stringify({
      expected, actual: uploads[0], expectedLink, actualLink: await reviewLink.getAttribute("href"),
      errors, unexpectedRequests, result: "PASS", serverMode: "intercepted fixture responses; no production requests",
    }, null, 2));
  } finally {
    await context.close();
  }
});
