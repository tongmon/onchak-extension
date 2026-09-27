import assert from "node:assert/strict";
import test from "node:test";
import {
  appendProductUrl,
  getPopupFeedbackState,
} from "../src/pages/popup-home/model/popup-home-form.ts";
import { createPopupMarginCalculationResult } from "../src/pages/popup-home/model/popup-margin-result.ts";

test("createPopupMarginCalculationResult includes unique popular item categories", () => {
  const result = createPopupMarginCalculationResult({
    inputs: {
      productionCostCurrency: "cny",
      productionCost: 1000,
      productUrls: [
        "https://detail.1688.com/offer/123.html",
        "https://detail.1688.com/offer/456.html",
      ],
      salesCommission: 10,
      coupangProductCost: 5000,
      inboundOutboundShippingFee: 300,
      exchangeRate: 1.2,
    },
    snapshot: {
      searchKeyword: "양말",
      averageCost: 5000,
      costRange: [4500, 5500],
      popularItems: [
        {
          imgUrl: "https://example.com/a.png",
          name: "item-a",
          category: "패션잡화 > 양말",
          brand: "brand-a",
          manufacturer: "maker-a",
          rating: 4.8,
          review: 120,
          cost: 5000,
          views: [100, 200],
        },
        {
          imgUrl: "https://example.com/b.png",
          name: "item-b",
          category: "패션잡화 > 양말",
          brand: "brand-b",
          manufacturer: "maker-b",
          rating: 4.7,
          review: 80,
          cost: 5200,
          views: [90, 190],
        },
        {
          imgUrl: "https://example.com/c.png",
          name: "item-c",
          category: "생활용품",
          brand: "brand-c",
          manufacturer: "maker-c",
          rating: 4.6,
          review: 60,
          cost: 4800,
          views: [80, 180],
        },
      ],
    },
  });

  assert.deepEqual(result.categories, ["패션잡화 > 양말", "생활용품"]);
  assert.equal(result.productUrl, "https://detail.1688.com/offer/123.html");
  assert.deepEqual(result.productUrls, [
    "https://detail.1688.com/offer/123.html",
    "https://detail.1688.com/offer/456.html",
  ]);
});

test("createPopupMarginCalculationResult uses production cost directly for KRW inputs", () => {
  const result = createPopupMarginCalculationResult({
    inputs: {
      productionCostCurrency: "krw",
      productionCost: 1200,
      productUrls: [],
      salesCommission: 10,
      coupangProductCost: 5000,
      inboundOutboundShippingFee: 300,
      exchangeRate: 352,
    },
    snapshot: {
      searchKeyword: "양말",
      averageCost: 5000,
      costRange: [4500, 5500],
      popularItems: [],
    },
  });

  assert.equal(result.product1688Cost, 1200);
});

test("appendProductUrl adds normalized links and rejects duplicates", () => {
  const first = appendProductUrl(
    [],
    " https://detail.1688.com/offer/123.html ",
  );
  const duplicate = appendProductUrl(
    first.productUrls,
    "https://detail.1688.com/offer/123.html",
  );
  const second = appendProductUrl(
    first.productUrls,
    "https://detail.1688.com/offer/456.html",
  );

  assert.equal(first.error, null);
  assert.deepEqual(first.productUrls, [
    "https://detail.1688.com/offer/123.html",
  ]);
  assert.match(duplicate.error ?? "", /이미 추가된/);
  assert.deepEqual(second.productUrls, [
    "https://detail.1688.com/offer/123.html",
    "https://detail.1688.com/offer/456.html",
  ]);
});

test("getPopupFeedbackState gives a recovery guide when the active tab content script is missing", () => {
  const feedback = getPopupFeedbackState(
    new Error("Could not establish connection. Receiving end does not exist."),
  );

  assert.equal(feedback.color, "yellow");
  assert.equal(feedback.title, "탭 연결 필요");
  assert.match(feedback.message, /쿠팡 Wing 탭을 새로고침/);
});

test("getPopupFeedbackState gives the same recovery guide when content script injection is blocked", () => {
  const feedback = getPopupFeedbackState(
    new Error(
      "현재 탭에 content script가 연결되지 않았습니다. 탭을 새로고침한 뒤 다시 시도해주세요.",
    ),
  );

  assert.equal(feedback.color, "yellow");
  assert.equal(feedback.title, "탭 연결 필요");
  assert.match(feedback.message, /Chrome 확장프로그램을 다시 로드/);
});

test("extension estimates match sourcing V2 units and distinguish monthly profit from revenue", () => {
  const inputs = {
    productionCostCurrency: "cny" as const,
    productionCost: 18,
    exchangeRate: 195,
    coupangProductCost: 5000,
    salesCommission: 10.8,
    inboundOutboundShippingFee: 300,
    productUrls: [],
  };
  const snapshot = {
    searchKeyword: "fixture",
    averageCost: 5550,
    costRange: [5000, 6100] as [number, number],
    popularItems: Array.from({ length: 12 }, (_, i) => ({
      name: "item",
      imgUrl: "",
      category: "생활",
      brand: "",
      manufacturer: "",
      rating: 0,
      review: 0,
      cost: 5000 + i * 100,
      views: [19000, 21000] as [number, number],
    })),
  };
  const result = createPopupMarginCalculationResult({ inputs, snapshot });
  assert.equal(result.margin, 514.545455);
  assert.equal(result.marginRate, 10.2909090909);
  assert.equal(result.expectedMonthlyRevenue, 3000000);
  assert.equal(result.expectedMonthlyMargin, 308727.272727);
  assert.ok(
    Math.abs(result.minimumAdvertisingReturn! * 100 - 1068.9045936396) < 1e-8,
  );
  assert.equal(result.expectedSalePrice, 5000);
  assert.equal(result.averagePrice, 5550);
  assert.equal(result.product1688Cost, 3510);
  assert.equal(result.productionCost, 18);
  assert.equal(result.productionCostCurrency, "cny");
  const zero = createPopupMarginCalculationResult({
    inputs: { ...inputs, coupangProductCost: 0 },
    snapshot,
  });
  assert.equal(zero.marginRate, null);
  assert.equal(zero.minimumAdvertisingReturn, null);
  const loss = createPopupMarginCalculationResult({
    inputs: { ...inputs, productionCost: 10000 },
    snapshot,
  });
  assert.equal(loss.valueAddedTax, 0);
  assert.equal(loss.margin, -1945924);
  assert.equal(loss.minimumAdvertisingReturn, null);
});

test('SCRUM-297 expect/actual keeps explicit product identity and never promotes a search result name', async () => {
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/scrum297-input.json', import.meta.url), 'utf8'));
  const actual = createPopupMarginCalculationResult(fixture);
  assert.equal(actual.productName, '접이식 수납함 32L');
  assert.equal(actual.searchKeyword, '수납함');
  assert.deepEqual(actual.categories, ['생활용품 > 수납', '가구 > 정리함']);
  assert.deepEqual(actual.productUrls, ['https://detail.1688.com/offer/297001.html', 'https://detail.1688.com/offer/297002.html?sku=blue']);
  assert.equal(actual.productionCost, 16.8);
  assert.equal(actual.expectedSalePrice, 23000);
  assert.equal(actual.productionCostCurrency, 'cny');
  assert.equal(actual.exchangeRate, 195.71);
  const withoutName = createPopupMarginCalculationResult({ ...fixture, inputs: { ...fixture.inputs, productName: '' } });
  assert.equal(withoutName.productName, null);
  assert.notEqual(withoutName.productName, fixture.snapshot.popularItems[0].name);
  assert.notEqual(actual.clientResultId, withoutName.clientResultId);
});

test('calculator link carries the returned record ID in the correct environment', async () => {
  const { marginReviewUrl } = await import('../src/pages/popup-home/model/margin-review-url.ts');
  assert.equal(marginReviewUrl('https://zephlyglobal.com', 'MR-297'), 'https://zephlyglobal.com/app/margin-results?marginResultId=MR-297');
  assert.equal(marginReviewUrl('http://localhost:8080', 'MR-297'), 'http://localhost:5173/app/margin-results?marginResultId=MR-297');
});
