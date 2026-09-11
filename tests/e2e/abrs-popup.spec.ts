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
const extensionPath = path.join(projectRoot, "dist");

async function openExtensionPopup(context: BrowserContext) {
  await context.route("http://localhost:8080/api/auth/me", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await context.route(
    "http://localhost:8080/api/ledger/imports/*/workflow",
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
        apiBaseUrl: "http://localhost:8080",
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
        apiBaseUrl: "http://localhost:8080",
        csrfToken: "csrf-token",
        accessToken: "access-token",
        tokenType: "Bearer",
      },
    }),
  );
  await page.reload();

  return page;
}

async function attachAbrsWorkbooks(
  page: Awaited<ReturnType<typeof openExtensionPopup>>,
) {
  for (const workbook of [
    "inventory_health_sku_info_20260616220816.xlsx",
    "Statistics-20260418~20260418_(0).xlsx",
    "A01549099-dailySettlement-20260418-20260418.xlsx",
    "price_inventory_260717.xlsx",
  ]) {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "파일 추가" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: workbook,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("xlsx"),
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

  try {
    const page = await openExtensionPopup(context);
    await expect(
      page.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await page.getByLabel("장부 날짜").fill("2026-04-18");

    await attachAbrsWorkbooks(page);

    await expect(
      page.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toBeVisible();
    await expect(
      page.getByText("Statistics-20260418~20260418_(0).xlsx"),
    ).toBeVisible();
    await expect(
      page.getByText("A01549099-dailySettlement-20260418-20260418.xlsx"),
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

  const fulfillUpload = (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ importId: "LEDGER-TEST", status: "IMPORTED" }),
    });

  await context.route(
    "http://localhost:8080/api/ledger/imports",
    fulfillUpload,
  );
  await context.route(
    "https://zephlyglobal.com/api/ledger/imports",
    fulfillUpload,
  );

  try {
    const page = await openExtensionPopup(context);
    await expect(
      page.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await page.getByLabel("장부 날짜").fill("2026-04-18");
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

  await context.route("http://localhost:8080/api/ledger/imports", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthorized" }),
    }),
  );

  try {
    const page = await openExtensionPopup(context);
    await page.getByLabel("장부 날짜").fill("2026-04-18");
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

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(
      firstPopup.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await firstPopup.getByLabel("장부 날짜").fill("2026-04-18");

    const chooserPromise = firstPopup.waitForEvent("filechooser");
    await firstPopup.getByRole("button", { name: "파일 추가" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "inventory_health_sku_info_20260616220816.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("xlsx"),
    });
    await expect(
      firstPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toBeVisible();
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(secondPopup.getByLabel("장부 날짜")).toHaveValue("2026-04-18");
    await expect(
      secondPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toBeVisible();

    await secondPopup.getByRole("button", { name: "비우기" }).click();
    await expect(
      secondPopup.getByText("inventory_health_sku_info_20260616220816.xlsx"),
    ).toHaveCount(0);
    await secondPopup.close();

    const thirdPopup = await openExtensionPopup(context);
    await expect(thirdPopup.getByLabel("장부 날짜")).toHaveValue("2026-04-18");
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

  try {
    const page = await openExtensionPopup(context);
    await page.getByLabel("장부 날짜").fill("2026-04-18");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "파일 추가" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "inventory_health_sku_info_20260616220816.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("xlsx"),
    });

    await page
      .getByRole("button", { name: "재고 현황 저장 파일 다운로드" })
      .click();

    await expect(page.getByText("파일 다운로드 시작")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const downloads = await chrome.downloads.search({});
          return downloads.some(
            (download) =>
              download.state === "complete" && download.totalBytes === 4,
          );
        }),
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

  try {
    const page = await openExtensionPopup(context);

    await expect(
      page.getByRole("button", { name: "상품 리스트 Coupang에서 가져오기" }),
    ).toBeVisible();
    await expect(page.getByText("0/4 필수")).toBeVisible();
    await expect(
      page
        .getByText("상품 리스트", { exact: true })
        .locator("xpath=../..")
        .getByText("Need"),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("ABRS popup restores the selected ledger date after losing foreground", async ({}, testInfo) => {
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

  try {
    const firstPopup = await openExtensionPopup(context);
    await expect(
      firstPopup.getByRole("heading", { name: "ABRS 장부 업로드" }),
    ).toBeVisible();
    await firstPopup.getByLabel("장부 날짜").fill("2026-04-18");
    await expect(firstPopup.getByLabel("장부 날짜")).toHaveValue("2026-04-18");

    const otherPage = await context.newPage();
    await otherPage.goto("https://example.com");
    await otherPage.bringToFront();
    await firstPopup.close();

    const secondPopup = await openExtensionPopup(context);
    await expect(secondPopup.getByLabel("장부 날짜")).toHaveValue("2026-04-18");
  } finally {
    await context.close();
  }
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
            encodeURIComponent("http://localhost:8080|admin@gmail.com");
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

async function isolatedContext(profile: string) {
  return chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

test("malformed successful ledger response preserves attachments for review", async ({}, testInfo) => {
  const context = await isolatedContext(
    testInfo.outputPath("malformed-profile"),
  );
  try {
    const page = await openExtensionPopup(context);
    await context.route("http://localhost:8080/api/ledger/imports", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html>proxy page</html>",
      }),
    );
    await page.getByLabel("장부 날짜").fill("2026-04-18");
    await attachAbrsWorkbooks(page);
    await page.getByRole("button", { name: "서버 업로드" }).click();
    await expect(page.getByText("업로드 실패", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Statistics-20260418~20260418_(0).xlsx"),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Statistics-20260418~20260418_(0).xlsx"),
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
        encodeURIComponent("http://localhost:8080|admin@gmail.com");
      await chrome.storage.local.set({ [key]: value });
    }, result);
    await page.reload();
    const ids: string[] = [];
    await context.route("http://localhost:8080/api/margin-results", (route) => {
      ids.push(route.request().postDataJSON().result.clientResultId);
      return route.fulfill({
        status: ids.length === 1 ? 401 : 200,
        json:
          ids.length === 1
            ? { message: "Authentication session is invalid" }
            : { status: "RECEIVED", id: "MR-RETRIED" },
      });
    });
    await context.route("http://localhost:8080/api/auth/csrf", (route) =>
      route.fulfill({ json: { token: "csrf-new" } }),
    );
    await context.route("http://localhost:8080/api/auth/login", (route) =>
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
            encodeURIComponent("http://localhost:8080|admin@gmail.com");
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
      await context.route('http://localhost:8080/api/auth/csrf', route => route.fulfill({json:{token:'csrf'}}));
      await context.route('http://localhost:8080/api/auth/login', route => route.fulfill({json:{authStatus:enrollment?'MFA_ENROLLMENT_REQUIRED':'MFA_REQUIRED', challengeToken:'challenge'}}));
      let prepareCalls = 0;
      await context.route('http://localhost:8080/api/auth/mfa/enroll/prepare', route => {
        prepareCalls++;
        return route.fulfill({json:{manualKey:'LOCAL_TEST_MANUAL_KEY'}});
      });
      await context.route(`http://localhost:8080/api/auth/mfa/${enrollment?'enroll/confirm':'verify'}`, route => route.fulfill({json:{authStatus:'AUTHENTICATED',accessToken:'mfa-token',recoveryCodes:enrollment?['LOCAL-RECOVERY-CODE']:[]}}));
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
      const key='popupMarginCalculatorDraft:account:'+encodeURIComponent('http://localhost:8080|admin@gmail.com');
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
