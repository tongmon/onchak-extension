import { createDailySettlementWorkbookBytes } from "../../src/app/entrypoints/content/abrs-daily-settlement-xlsx";
import { ABRS_SETTLEMENT_SLOTS, classifyAbrsLedgerFile } from "../../src/pages/abrs-automation/model/abrs-ledger-files";
import { createPopupMarginCalculationResult } from "../../src/pages/popup-home/model/popup-margin-result";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  chromium,
  type BrowserContext,
  type Route,
} from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const workbookBytes = Buffer.from(createDailySettlementWorkbookBytes({}));
const aprilDays = Array.from({ length: 30 }, (_, i) => `2026-04-${String(i + 1).padStart(2, "0")}`);
const monthlyReceipt = { status: "IMPORTED", ingestionMode: "MONTHLY", periodStart: "2026-04-01", periodEnd: "2026-04-30", importId: "LEDGER-TEST-30", imports: aprilDays.map((targetDate, i) => ({ targetDate, importId: `LEDGER-TEST-${i + 1}`, status: "IMPORTED" })) };
const extensionPath = process.env.ABRS_EXTENSION_PATH ?? path.join(projectRoot, "dist");

async function openExtensionPopup(context: BrowserContext) {
  await context.route("https://zephlyglobal.com/api/auth/me", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await context.route("https://zephlyglobal.com/api/ledger/imports/period/preflight", (route) =>
    route.fulfill({ json: { canAnalyze: true, missingFileTypes: [], files: [], issues: [] } }),
  );
  await context.route(
    "https://zephlyglobal.com/api/ledger/imports/*/workflow",
    (route) =>
      route.fulfill({
        json: { needsRecalculation: true, calculationState: "BLOCKED" },
      }),
  );
  let serviceWorker = context.serviceWorkers()[0];

  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }

  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/src/app/entrypoints/popup/index.html`,
  );
  await expect(page.getByRole("button", { name: /^(로그인|로그아웃)$/ }).first()).toBeVisible();
  await page.evaluate(() =>
    chrome.storage.local.set({
      authConfig: {
        mode: "remote",
        apiBaseUrl: "https://zephlyglobal.com",
        loginPath: "/api/auth/login",
        csrfPath: "/api/auth/csrf",
      },
      authSession: {
        user: {
          email: "admin@gmail.com",
          displayName: "Admin",
        },
        authenticatedAt: new Date().toISOString(),
        mode: "remote",
        apiBaseUrl: "https://zephlyglobal.com",
        csrfToken: "csrf-token",
        accessToken: "access-token",
        tokenType: "Bearer",
      },
    }),
  );
  await page.reload();

  return page;
}

async function openTestWingSeller(context: BrowserContext, sellerId: string) {
  await context.addCookies([{ name: 'sc_vid', value: sellerId, url: 'https://wing.coupang.com', secure: true }]);
  await context.route('https://wing.coupang.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><head><title>Wing seller fixture</title></head><body>Isolated seller fixture</body></html>' }));
  const wing = await context.newPage();
  await wing.goto('https://wing.coupang.com/tenants/rfm-inventory/management/list');
  return wing;
}

async function attachAbrsWorkbooks(
  page: Awaited<ReturnType<typeof openExtensionPopup>>,
) {
  for (const workbook of [
    "inventory_health_sku_info_20260616220816.xlsx",
    ...aprilDays.map((date) => `Statistics-${date.replaceAll("-", "")}~${date.replaceAll("-", "")}_(0).xlsx`),
    "A01549099_pa_daily_vendorItem_20260401_20260430.xlsx",
    "price_inventory_260717.xlsx",
    ...["CATEGORY_TR", "WAREHOUSING_SHIPPING", "STORAGE_FEE", "CRETURN_PICKUP_RESTOCKING", "VRETURN_HANDLING", "VRETURN_SHIPPING", "INVENTORY_COMPENSATION", "VALUE_ADDED_SERVICE_FEE", "PPIR"].map((slot) => `A01549099-${slot}-20260401_20260430.xlsx`),
  ]) {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "파일 추가" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: workbook,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbookBytes,
    });
  }
}

test("ABRS popup keeps one-by-one workbook attachments stacked by slot", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  try {
    const page = await openExtensionPopup(context);
    await expect(
      page.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await page.getByLabel("업로드 월").fill("2026-04");

    await attachAbrsWorkbooks(page);

    await expect(
      page.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toBeVisible();
    await expect(
      page.getByText("Statistics-20260401~20260401_(0).xlsx"),
    ).toBeVisible();
    await expect(
      page.getByText("A01549099_pa_daily_vendorItem_20260401_20260430.xlsx"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "서버 업로드" }),
    ).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("ABRS popup hides missing-file validation after successful server upload clears the cache", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("upload-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  const fulfillUpload = (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(monthlyReceipt),
    });

  await context.route(
    "https://zephlyglobal.com/api/ledger/imports/period",
    fulfillUpload,
  );

  try {
    const page = await openExtensionPopup(context);
    await expect(
      page.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await page.getByLabel("업로드 월").fill("2026-04");
    await attachAbrsWorkbooks(page);

    await page.getByRole("button", { name: "서버 업로드" }).click();

    await expect(page.getByText("업로드 완료")).toBeVisible();
    await expect(page.getByText("확인 필요")).toHaveCount(0);
    await expect(
      page.getByText(
        "재고 현황 파일을 추가해주세요. 판매 현황 파일을 추가해주세요. 광고비/정산 파일을 추가해주세요.",
      ),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("ABRS popup clears an expired OMS session after an unauthorized upload", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("unauthorized-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  await context.route("https://zephlyglobal.com/api/ledger/imports/period", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthorized" }),
    }),
  );

  try {
    const page = await openExtensionPopup(context);
    await page.getByLabel("업로드 월").fill("2026-04");
    await attachAbrsWorkbooks(page);

    await page.getByRole("button", { name: "서버 업로드" }).click();

    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const stored = await chrome.storage.local.get(["authSession"]);
          return stored.authSession ?? null;
        }),
      )
      .toBeNull();
  } finally {
    await context.close();
  }
});

test("ABRS popup restores cached workbook attachments after popup remount", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("persistent-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(
      firstPopup.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await firstPopup.getByLabel("업로드 월").fill("2026-04");

    const chooserPromise = firstPopup.waitForEvent("filechooser");
    await firstPopup.getByRole("button", { name: "파일 추가" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "inventory_health_sku_info_20260616220816.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbookBytes,
    });
    await expect(
      firstPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toBeVisible();
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(secondPopup.getByLabel("업로드 월")).toHaveValue("2026-04");
    await expect(
      secondPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toBeVisible();

    await secondPopup.getByRole("button", { name: "비우기" }).click();
    await expect(
      secondPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toHaveCount(0);
    await secondPopup.close();

    const thirdPopup = await openExtensionPopup(context);
    await expect(thirdPopup.getByLabel("업로드 월")).toHaveValue("2026-04");
    await expect(
      thirdPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("ABRS popup downloads a cached workbook from its row action", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("cached-download-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  try {
    const page = await openExtensionPopup(context);
    await page.getByLabel("업로드 월").fill("2026-04");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "파일 추가" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "inventory_health_sku_info_20260616220816.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbookBytes,
    });

    await page
      .getByRole("button", { name: "재고 현황 저장 파일 다운로드" })
      .click();

    await expect(page.getByText("파일 다운로드 시작")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async (expectedBytes) => {
          const downloads = await chrome.downloads.search({});
          return downloads.some(
            (download) =>
              download.state === "complete" && download.totalBytes === expectedBytes,
          );
        }, workbookBytes.length),
      )
      .toBe(true);
  } finally {
    await context.close();
  }
});

test("ABRS popup renders the Coupang product list as required", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("product-list-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  try {
    const page = await openExtensionPopup(context);

    await expect(
      page.getByRole("button", { name: "상품 리스트 Coupang에서 가져오기" }),
    ).toBeVisible();
    await expect(page.getByText("0/13종 · 원본 0개")).toBeVisible();
    await expect(
      page
        .getByText("상품 리스트", { exact: true })
        .locator("xpath=..")
        .getByText("파일 없음", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("ABRS popup restores the selected upload month after losing foreground", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("selected-date-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(
      firstPopup.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await firstPopup.getByLabel("업로드 월").fill("2026-04");
    await expect(firstPopup.getByLabel("업로드 월")).toHaveValue("2026-04");

    const otherPage = await context.newPage();
    await otherPage.goto("https://example.com");
    await otherPage.bringToFront();
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(secondPopup.getByLabel("업로드 월")).toHaveValue("2026-04");
  } finally {
    await context.close();
  }
});

test("ABRS daily/monthly selection shows one period input and restores the selected daily date", async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath("daily-selection-profile"));
  try {
    const page = await openExtensionPopup(context);
    await expect(page.getByLabel("업로드 월")).toBeVisible();
    await expect(page.getByLabel("장부 날짜", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("조회 시작일", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("조회 종료일", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "일별 업로드", exact: true })).toBeEnabled();
    await page.getByText("일별 업로드", { exact: true }).click();
    await page.getByLabel("업로드 날짜").fill("2026-04-18");
    await expect(page.getByText("대상 기간: 2026-04-18 (하루)", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "4종 가져오기 및 서버 전송", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "주문·판매수수료 Coupang에서 가져오기", exact: true })).toBeDisabled();
    await expect(page.getByText("월별 수집", { exact: true })).toHaveCount(9);
    await expect(page.getByText("재고 현황·상품 리스트는 가져오는 시점의 현황입니다.", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const result = await chrome.runtime.sendMessage({ type: "abrs/get-ledger-target-date", payload: { fallbackDate: "2026-04-30" } });
      return result?.data;
    })).toMatchObject({ targetDate: "2026-04-18", uploadMode: "daily" });
    await page.reload();
    await expect(page.getByRole("radio", { name: "일별 업로드", exact: true })).toBeChecked();
    await expect(page.getByLabel("업로드 날짜")).toHaveValue("2026-04-18");
    await expect(page.getByRole("radio", { name: "월별 업로드", exact: true })).toBeEnabled();
    await page.getByText("월별 업로드", { exact: true }).click();
    await expect(page.getByLabel("업로드 월")).toHaveValue("2026-04");
    await expect(page.getByText("대상 기간: 2026-04-01 ~ 2026-04-30", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "13종 가져오기 및 서버 전송", exact: true })).toBeEnabled();
  } finally { await context.close(); }
});

test("ABRS locks period selection and every file action while a daily upload is pending", async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath("daily-upload-lock-profile"));
  let releasePreflight = () => {};
  const preflightGate = new Promise<void>((resolve) => { releasePreflight = resolve; });
  try {
    const page = await openExtensionPopup(context);
    await expect(page.getByRole("radio", { name: "일별 업로드", exact: true })).toBeEnabled();
    await page.getByText("일별 업로드", { exact: true }).click();
    await page.getByLabel("업로드 날짜").fill("2026-04-18");
    const names = ["inventory_health_sku_info_20260616220816.xlsx", "Statistics-20260418~20260418_(0).xlsx",
      "A01549099_pa_daily_vendorItem_20260418_20260418.xlsx", "price_inventory_260717.xlsx"];
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "파일 추가", exact: true }).click();
    await (await chooserPromise).setFiles(names.map((name) => ({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: workbookBytes })));
    await expect(page.getByText("4/4종 · 원본 4개", { exact: true })).toBeVisible();
    await context.route("https://zephlyglobal.com/api/ledger/imports/period/preflight", async (route) => {
      const body = route.request().postData() ?? "";
      expect(body).toContain("DAILY");
      expect(body).toContain("2026-04-18");
      expect((body.match(/name="files"/g) ?? []).length).toBe(4);
      await preflightGate;
      await route.fulfill({ json: { canAnalyze: true, missingFileTypes: [], files: [], issues: [] } });
    });
    await context.route("https://zephlyglobal.com/api/ledger/imports/period", (route) => route.fulfill({ json: {
      status: "IMPORTED", ingestionMode: "DAILY", periodStart: "2026-04-18", periodEnd: "2026-04-18", importId: "DAILY-TEST",
      imports: [{ targetDate: "2026-04-18", importId: "DAILY-TEST", status: "IMPORTED" }],
    } }));
    await page.getByRole("button", { name: "서버 업로드", exact: true }).click();
    await expect(page.getByLabel("업로드 날짜")).toBeDisabled();
    await expect(page.getByRole("radio", { name: "월별 업로드", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "재고 현황 Coupang에서 가져오기", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "재고 현황 저장 파일 다운로드", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "비우기", exact: true })).toBeDisabled();
    releasePreflight();
    await expect(page.getByText("업로드 완료", { exact: true })).toBeVisible();
    await expect(page.getByText(/1일의 장부를 접수했습니다/)).toBeVisible();
    await expect(page.getByText("0/4종 · 원본 0개", { exact: true })).toBeVisible();
  } finally { releasePreflight(); await context.close(); }
});

test("ABRS daily upload excludes nine settlement kinds restored from an older daily cache", async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath("legacy-daily-cache-profile"));
  try {
    const page = await openExtensionPopup(context);
    await openTestWingSeller(context, 'A01549099');
    const targetDate = "2026-04-18";
    const names = ["inventory_health_sku_info_20260616220816.xlsx", "Statistics-20260418~20260418_(0).xlsx",
      "A01549099_pa_daily_vendorItem_20260418_20260418.xlsx", "price_inventory_260717.xlsx",
      ...ABRS_SETTLEMENT_SLOTS.map((slot) => `A01549099-${slot}-ko-legacy-original.xlsx`)];
    const entries = names.map((fileName) => ({ ...classifyAbrsLedgerFile(fileName)!, fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: workbookBytes.toString("base64"),
      size: workbookBytes.length, savedAt: "2026-04-18T00:00:00Z", collectionVersion: 2, sellerId: 'A01549099' }));
    await page.evaluate(async ({ targetDate, entries }) => {
      const saved = await chrome.runtime.sendMessage({ type: "abrs/save-ledger-batch-files",
        payload: { targetDate, periodStart: targetDate, periodEnd: targetDate, entries } });
      if (!saved.ok) throw new Error(saved.error);
      const selected = await chrome.runtime.sendMessage({ type: "abrs/save-ledger-target-date", payload: { targetDate, uploadMode: "daily" } });
      if (!selected.ok) throw new Error(selected.error);
    }, { targetDate, entries });
    await page.reload();
    await expect(page.getByLabel("업로드 날짜")).toHaveValue(targetDate);
    await expect(page.getByText("4/4종 · 원본 4개", { exact: true })).toBeVisible();
    await expect(page.getByText(/legacy-original\.xlsx/)).toHaveCount(0);
    const sent: string[] = [];
    const assertDailyFiles = (body: string) => {
      expect((body.match(/name="files"/g) ?? []).length).toBe(4);
      expect(body).not.toContain("legacy-original.xlsx");
      expect(body).not.toContain("CATEGORY_TR");
    };
    await context.route("https://zephlyglobal.com/api/ledger/imports/period/preflight", async (route) => {
      sent.push("preflight"); assertDailyFiles(route.request().postData() ?? "");
      await route.fulfill({ json: { canAnalyze: true, missingFileTypes: [], files: [], issues: [] } });
    });
    await context.route("https://zephlyglobal.com/api/ledger/imports/period", async (route) => {
      sent.push("upload"); assertDailyFiles(route.request().postData() ?? "");
      await route.fulfill({ json: { status: "IMPORTED", ingestionMode: "DAILY", periodStart: targetDate, periodEnd: targetDate,
        importId: "LEGACY-DAILY-TEST", imports: [{ targetDate, importId: "LEGACY-DAILY-TEST", status: "IMPORTED" }] } });
    });
    // Cache progress and the final collection restore must apply the same filter as initial loading.
    await page.getByRole("button", { name: "4종 가져오기 및 서버 전송", exact: true }).click();
    await expect(page.getByText("업로드 완료", { exact: true })).toBeVisible();
    expect(sent).toEqual(["preflight", "upload"]);
    await expect(page.getByText("0/4종 · 원본 0개", { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("automatic collection blocks a changed Wing seller and preserves the previous originals", async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath('changed-wing-seller-profile'));
  try {
    const page = await openExtensionPopup(context);
    await page.getByText('일별 업로드', { exact: true }).click();
    await page.getByLabel('업로드 날짜').fill('2026-04-18');
    const names = ['inventory_health_sku_info_20260616220816.xlsx', 'Statistics-20260418~20260418_(0).xlsx',
      'A01549099_pa_daily_vendorItem_20260418_20260418.xlsx', 'price_inventory_260717.xlsx'];
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '파일 추가', exact: true }).click();
    await (await chooser).setFiles(names.map((name) => ({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbookBytes })));
    await expect(page.getByText('4/4종 · 원본 4개', { exact: true })).toBeVisible();
    await openTestWingSeller(context, 'A12345678');
    let uploads = 0;
    await context.route('https://zephlyglobal.com/api/ledger/imports/period**', (route) => { uploads++; return route.abort(); });
    await page.getByRole('button', { name: '4종 가져오기 및 서버 전송', exact: true }).click();
    await expect(page.getByText(/쿠팡 판매자가 다른 원본이 섞여 있습니다/)).toBeVisible();
    await expect(page.getByText('4/4종 · 원본 4개', { exact: true })).toBeVisible();
    expect(uploads).toBe(0);
    const result = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'abrs/get-ledger-batch', payload: { targetDate: '2026-04-18', periodStart: '2026-04-18', periodEnd: '2026-04-18' } }));
    expect(result.data.entries.map((entry: { fileName: string }) => entry.fileName).sort()).toEqual([...names].sort());
  } finally { await context.close(); }
});

test("manual cross-seller attachment is rejected without replacing the first seller's cached original", async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath('manual-cross-seller-profile'));
  try {
    const page = await openExtensionPopup(context);
    await page.getByText('일별 업로드', { exact: true }).click();
    await page.getByLabel('업로드 날짜').fill('2026-04-18');
    for (const seller of ['A01549099', 'A12345678']) {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '파일 추가', exact: true }).click();
      await (await chooser).setFiles({ name: `${seller}_pa_daily_vendorItem_20260418_20260418.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbookBytes });
      if (seller === 'A01549099') await expect(page.getByText(`${seller}_pa_daily_vendorItem_20260418_20260418.xlsx`, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/쿠팡 판매자가 다른 원본이 섞여 있습니다/)).toBeVisible();
    await expect(page.getByText('A01549099_pa_daily_vendorItem_20260418_20260418.xlsx', { exact: true })).toBeVisible();
    await expect(page.getByText('A12345678_pa_daily_vendorItem_20260418_20260418.xlsx', { exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test("a late upload receipt preserves another window's changed and newly collected originals", async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath("concurrent-originals-profile"));
  let releaseUpload = () => {};
  const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
  let uploadStarted = false;
  try {
    const first = await openExtensionPopup(context);
    await expect(first.getByRole("radio", { name: "일별 업로드", exact: true })).toBeEnabled();
    await first.getByText("일별 업로드", { exact: true }).click();
    await first.getByLabel("업로드 날짜").fill("2026-04-18");
    const originalNames = ["inventory_health_sku_info_20260616220816.xlsx", "Statistics-20260418~20260418_(0).xlsx",
      "A01549099_pa_daily_vendorItem_20260418_20260418.xlsx", "price_inventory_260717.xlsx"];
    const initialChooser = first.waitForEvent("filechooser");
    await first.getByRole("button", { name: "파일 추가", exact: true }).click();
    await (await initialChooser).setFiles(originalNames.map((name) => ({ name,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: workbookBytes })));
    await expect(first.getByText("4/4종 · 원본 4개", { exact: true })).toBeVisible();
    await context.route("https://zephlyglobal.com/api/ledger/imports/period", async (route) => {
      uploadStarted = true;
      await uploadGate;
      await route.fulfill({ json: { status: "IMPORTED", ingestionMode: "DAILY", periodStart: "2026-04-18", periodEnd: "2026-04-18",
        importId: "CONCURRENT-TEST", imports: [{ targetDate: "2026-04-18", importId: "CONCURRENT-TEST", status: "IMPORTED" }] } });
    });
    await first.getByRole("button", { name: "서버 업로드", exact: true }).click();
    await expect.poll(() => uploadStarted).toBe(true);

    const second = await context.newPage();
    await second.goto(first.url());
    await expect(second.getByLabel("업로드 날짜")).toHaveValue("2026-04-18");
    await expect(second.getByText("4/4종 · 원본 4개", { exact: true })).toBeVisible();
    // Add a valid ZIP comment so the updated original has different bytes and the same file name.
    const changedWorkbook = Buffer.concat([workbookBytes, Buffer.from("new")]);
    changedWorkbook.writeUInt16LE(3, workbookBytes.length - 2);
    const newInventory = "inventory_health_sku_info_20261012120000.xlsx";
    const newNames = ["Statistics-20260418~20260418_(0).xlsx", "Statistics-20260418~20260418_(1).xlsx", newInventory];
    const nextChooser = second.waitForEvent("filechooser");
    await second.getByRole("button", { name: "파일 추가", exact: true }).click();
    await (await nextChooser).setFiles(newNames.map((name) => ({ name,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: name === newInventory ? workbookBytes : changedWorkbook })));
    await expect(second.getByText("4/4종 · 원본 5개", { exact: true })).toBeVisible();

    releaseUpload();
    await expect(first.getByText("업로드 완료", { exact: true })).toBeVisible();
    await expect(first.getByText(/새로 추가되거나 변경된 원본 3개는 보관했습니다/)).toBeVisible();
    await expect(first.getByText("2/4종 · 원본 3개", { exact: true })).toBeVisible();
    await expect.poll(() => first.evaluate(async () => {
      const result = await chrome.runtime.sendMessage({ type: "abrs/get-ledger-batch",
        payload: { targetDate: "2026-04-18", periodStart: "2026-04-18", periodEnd: "2026-04-18" } });
      return result.data.entries.map((entry: { fileName: string }) => entry.fileName).sort();
    })).toEqual([...newNames].sort());
    await first.reload();
    await expect(first.getByText("2/4종 · 원본 3개", { exact: true })).toBeVisible();
    await expect(first.getByText(newInventory, { exact: true })).toBeVisible();
  } finally { releaseUpload(); await context.close(); }
});

test("margin calculator restores draft inputs after popup remount", async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("margin-draft-profile"),
    {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );
  await installTestNetworkGuard(context);

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(
      firstPopup.getByRole("heading", { name: "마진율 계산기" }),
    ).toBeVisible();
    await firstPopup.getByLabel("상품 매입 원가(소싱 원가)").fill("12500");
    await firstPopup.getByLabel("쿠팡 상품 판매가").fill("22900");
    await firstPopup
      .getByRole("textbox", { name: "원가 사이트 링크", exact: true })
      .fill("https://detail.1688.com/offer/123.html");
    await firstPopup
      .getByRole("button", { name: "원가 사이트 링크 추가", exact: true })
      .click();
    await firstPopup
      .getByRole("textbox", { name: "원가 사이트 링크", exact: true })
      .fill("https://detail.1688.com/offer/456.html");
    await firstPopup
      .getByRole("button", { name: "원가 사이트 링크 추가", exact: true })
      .click();

    await expect
      .poll(() =>
        firstPopup.evaluate(async () => {
          const key =
            "popupMarginCalculatorDraft:account:" +
            encodeURIComponent("https://zephlyglobal.com|admin@gmail.com");
          const stored = await chrome.storage.local.get(key);
          return stored[key]?.productUrls;
        }),
      )
      .toEqual([
        "https://detail.1688.com/offer/123.html",
        "https://detail.1688.com/offer/456.html",
      ]);
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(
      secondPopup.getByLabel("상품 매입 원가(소싱 원가)"),
    ).toHaveValue("12,500위안");
    await expect(secondPopup.getByLabel("쿠팡 상품 판매가")).toHaveValue(
      "22,900원",
    );
    await expect(
      secondPopup.getByRole("textbox", {
        name: "원가 사이트 링크",
        exact: true,
      }),
    ).toHaveValue("");
    await expect(
      secondPopup.getByRole("link", {
        name: "1. https://detail.1688.com/offer/123.html",
      }),
    ).toBeVisible();
    await expect(
      secondPopup.getByRole("link", {
        name: "2. https://detail.1688.com/offer/456.html",
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

// Production builds migrate localhost configuration to their production default.
// Mock that allowed origin and abort every request without an explicit test route.
async function installTestNetworkGuard(context: BrowserContext) {
  await context.route("https://zephlyglobal.com/**", (route) => route.abort("blockedbyclient"));
}

async function isolatedContext(profile: string) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  await installTestNetworkGuard(context);
  return context;
}

test("malformed successful ledger response preserves attachments for review", async ({}, testInfo) => {
  const context = await isolatedContext(
    testInfo.outputPath("malformed-profile"),
  );
  try {
    const page = await openExtensionPopup(context);
    await context.route("https://zephlyglobal.com/api/ledger/imports/period", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html>proxy page</html>",
      }),
    );
    await page.getByLabel("업로드 월").fill("2026-04");
    await attachAbrsWorkbooks(page);
    await page.getByRole("button", { name: "서버 업로드" }).click();
    await expect(page.getByText("업로드 실패", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Statistics-20260401~20260401_(0).xlsx"),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Statistics-20260401~20260401_(0).xlsx"),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("margin upload reauth restores the captured result and retries its original id", async ({}, testInfo) => {
  const context = await isolatedContext(
    testInfo.outputPath("margin-reauth-profile"),
  );
  try {
    const page = await openExtensionPopup(context);
    const result = createPopupMarginCalculationResult({
      inputs: {
        productionCostCurrency: "cny",
        productionCost: 18,
        exchangeRate: 195,
        coupangProductCost: 5000,
        salesCommission: 10.8,
        inboundOutboundShippingFee: 300,
        productUrls: [],
      },
      snapshot: {
        searchKeyword: "재로그인 테스트",
        averageCost: 5000,
        costRange: [5000, 5000],
        popularItems: [],
      },
    });
    await page.evaluate(async (value) => {
      const key =
        "pendingMarginResult:account:" +
        encodeURIComponent("https://zephlyglobal.com|admin@gmail.com");
      await chrome.storage.local.set({ [key]: value });
    }, result);
    await page.reload();
    const ids: string[] = [];
    await context.route("https://zephlyglobal.com/api/margin-results", (route) => {
      ids.push(route.request().postDataJSON().result.clientResultId);
      return route.fulfill({
        status: ids.length === 1 ? 401 : 200,
        json:
          ids.length === 1
            ? { message: "Authentication session is invalid" }
            : { status: "RECEIVED", id: "MR-RETRIED" },
      });
    });
    await context.route("https://zephlyglobal.com/api/auth/csrf", (route) =>
      route.fulfill({ json: { token: "csrf-new" } }),
    );
    await context.route("https://zephlyglobal.com/api/auth/login", (route) =>
      route.fulfill({
        json: {
          authStatus: "AUTHENTICATED",
          accessToken: "token-new",
          tokenType: "Bearer",
        },
      }),
    );
    await page.getByRole("button", { name: "결과 서버 업로드" }).click();
    await expect(
      page.getByRole("button", { name: "로그인", exact: true }),
    ).toBeVisible();
    await page.getByPlaceholder("you@example.com").fill("admin@gmail.com");
    await page.getByPlaceholder("password").fill("1111");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.getByRole("button", { name: "결과 서버 업로드" }).click();
    await expect.poll(() => ids.length).toBe(2);
    expect(ids).toEqual([result.clientResultId, result.clientResultId]);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const key =
            "pendingMarginResult:account:" +
            encodeURIComponent("https://zephlyglobal.com|admin@gmail.com");
          return (await chrome.storage.local.get(key))[key] ?? null;
        }),
      )
      .toBeNull();
  } finally {
    await context.close();
  }
});

for (const enrollment of [false, true]) {
  test(`MFA ${enrollment ? 'enrollment' : 'verification'} completes before opening account work`, async ({}, testInfo) => {
    const context = await isolatedContext(testInfo.outputPath('mfa-profile'));
    try {
      const page = await openExtensionPopup(context);
      await page.evaluate(() => chrome.storage.local.remove('authSession'));
      await context.route('https://zephlyglobal.com/api/auth/csrf', route => route.fulfill({json:{token:'csrf'}}));
      await context.route('https://zephlyglobal.com/api/auth/login', route => route.fulfill({json:{authStatus:enrollment?'MFA_ENROLLMENT_REQUIRED':'MFA_REQUIRED', challengeToken:'challenge'}}));
      let prepareCalls = 0;
      await context.route('https://zephlyglobal.com/api/auth/mfa/enroll/prepare', route => {
        prepareCalls++;
        return route.fulfill({json:{manualKey:'LOCAL_TEST_MANUAL_KEY'}});
      });
      await context.route(`https://zephlyglobal.com/api/auth/mfa/${enrollment?'enroll/confirm':'verify'}`, route => route.fulfill({json:{authStatus:'AUTHENTICATED',accessToken:'mfa-token',recoveryCodes:enrollment?['LOCAL-RECOVERY-CODE']:[]}}));
      await page.getByPlaceholder('you@example.com').fill('admin@gmail.com');
      await page.getByPlaceholder('password').fill('1111');
      await page.getByRole('button',{name:'로그인',exact:true}).click();
      await expect(page.getByText('2단계 인증',{exact:true})).toBeVisible();
      await page.getByLabel('인증 코드').fill('123456');
      await page.getByRole('button',{name:'인증 확인',exact:true}).click();
      if(enrollment) {
        await expect(page.getByText('LOCAL-RECOVERY-CODE',{exact:true})).toBeVisible();
        expect(await page.evaluate(async()=>!!(await chrome.storage.local.get('authSession')).authSession)).toBe(false);
        await page.getByRole('button',{name:'복구 코드를 저장했습니다'}).click();
        expect(prepareCalls).toBe(1);
      }
      await expect(page.getByRole('heading',{name:'ABRS 장부 업로드'})).toBeVisible();
    } finally {await context.close();}
  });
}

test('switching accounts hides the previous account draft and restores it only for its owner', async ({},testInfo)=>{
  const context=await isolatedContext(testInfo.outputPath('account-profile'));
  try {
    const page=await openExtensionPopup(context);
    await page.getByLabel('상품 매입 원가(소싱 원가)').fill('9876');
    await expect.poll(()=>page.evaluate(async()=>{
      const key='popupMarginCalculatorDraft:account:'+encodeURIComponent('https://zephlyglobal.com|admin@gmail.com');
      return (await chrome.storage.local.get(key))[key]?.productionCost;
    })).toBe('9876');
    async function switchAccount(email:string) {
      await page.evaluate(async email=>{
        const {authSession}=await chrome.storage.local.get('authSession');
        await chrome.storage.local.set({authSession:{...authSession,accessToken:email,user:{email,displayName:email}}});
      },email);
    }
    await switchAccount('second@example.com');
    await expect(page.getByLabel('상품 매입 원가(소싱 원가)')).toHaveValue('');
    await switchAccount('admin@gmail.com');
    await expect(page.getByLabel('상품 매입 원가(소싱 원가)')).toHaveValue('9,876위안');
  } finally {await context.close();}
});

test('ABRS collection action sends thirteen sources through preflight then upload', async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath('thirteen-collection-profile'));
  try {
    const page = await openExtensionPopup(context);
    await page.getByLabel('업로드 월').fill('2026-04');
    const requests: string[] = [];
    await context.route('https://zephlyglobal.com/api/ledger/imports/period/preflight', async (route) => {
      requests.push('preflight');
      const body = route.request().postData() ?? '';
      expect((body.match(/name="files"/g) ?? []).length).toBe(42);
      await route.fulfill({ json: { canAnalyze: true, missingFileTypes: [], files: [], issues: [] } });
    });
    await context.route('https://zephlyglobal.com/api/ledger/imports/period', async (route) => {
      requests.push('upload');
      const body = route.request().postData() ?? '';
      expect((body.match(/name="files"/g) ?? []).length).toBe(42);
      expect(body).toContain('pa_daily_vendorItem');
      expect(body).toContain('BARCODE_LABELING_FEE');
      await route.fulfill({ json: monthlyReceipt });
    });
    await page.evaluate(({ base64, days }) => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = ((message: { type: string; payload?: { slot: string; periodStart: string; periodEnd: string; expectedSellerId?: string } }) => {
        if (message.type === 'abrs/get-wing-seller') return Promise.resolve({ ok: true, data: { sellerId: 'A01549099' } });
        if (message.type !== 'abrs/download-active-tab-ledger-file') return original(message);
        const request = message.payload!;
        if (request.periodStart !== '2026-04-01' || request.periodEnd !== '2026-04-30') throw new Error('Unexpected period');
        if (request.expectedSellerId !== 'A01549099') throw new Error('Unexpected seller');
        const names: Record<string, string> = {
          inventoryHealth: 'inventory_health_sku_info_20260616220816.xlsx',
          productList: 'price_inventory_260717.xlsx',
          adPerformance: 'A01549099_pa_daily_vendorItem_20260401_20260430.xlsx',
          VALUE_ADDED_SERVICE_FEE: 'A01549099-BARCODE_LABELING_FEE-20260401_20260430.xlsx',
        };
        const files = request.slot === 'salesStatistics'
          ? days.map((date) => ({ slot: request.slot, fileName: `Statistics-${date.replaceAll('-', '')}~${date.replaceAll('-', '')}_(0).xlsx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64 }))
          : [{ slot: request.slot, fileName: names[request.slot] ?? `A01549099-${request.slot}-20260401_20260430.xlsx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64 }];
        return Promise.resolve({ ok: true, data: files.map((file) => ({ ...file, sellerId: 'A01549099' })) });
      }) as typeof chrome.runtime.sendMessage;
    }, { base64: workbookBytes.toString('base64'), days: aprilDays });
    await page.getByRole('button', { name: '13종 가져오기 및 서버 전송' }).click();
    await expect(page.getByText('업로드 완료', { exact: true })).toBeVisible();
    expect(requests).toEqual(['preflight', 'upload']);
    await expect(page.getByText('0/13종 · 원본 0개')).toBeVisible();
  } finally { await context.close(); }
});

test('ABRS server preflight missing report blocks import and retains all forty-two monthly originals', async ({}, testInfo) => {
  const context = await isolatedContext(testInfo.outputPath('missing-preflight-profile'));
  try {
    const page = await openExtensionPopup(context);
    await page.getByLabel('업로드 월').fill('2026-04');
    await attachAbrsWorkbooks(page);
    let uploadCount = 0;
    await context.route('https://zephlyglobal.com/api/ledger/imports/period/preflight', (route) => route.fulfill({
      json: { canAnalyze: true, missingFileTypes: ['COUPANG_PPIR'], files: [], issues: [] },
    }));
    await context.route('https://zephlyglobal.com/api/ledger/imports/period', (route) => {
      uploadCount += 1;
      return route.fulfill({ json: { importId: 'SHOULD-NOT-IMPORT', status: 'IMPORTED' } });
    });
    await page.getByRole('button', { name: '서버 업로드', exact: true }).click();
    await expect(page.getByText('업로드 실패', { exact: true })).toBeVisible();
    await expect(page.getByText(/누락 자료: COUPANG_PPIR/)).toBeVisible();
    expect(uploadCount).toBe(0);
    await page.reload();
    await expect(page.getByText('13/13종 · 원본 42개')).toBeVisible();
  } finally { await context.close(); }
});
