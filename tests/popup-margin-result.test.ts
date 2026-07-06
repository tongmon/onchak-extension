import assert from 'node:assert/strict';
import test from 'node:test';
import { getPopupFeedbackState } from '../src/pages/popup-home/model/popup-home-form.ts';
import { createPopupMarginCalculationResult } from '../src/pages/popup-home/model/popup-margin-result.ts';

test('createPopupMarginCalculationResult includes unique popular item categories', () => {
  const result = createPopupMarginCalculationResult({
    inputs: {
      productionCostCurrency: 'cny',
      productionCost: 1000,
      salesCommission: 10,
      coupangProductCost: 5000,
      inboundOutboundShippingFee: 300,
      exchangeRate: 1.2,
    },
    snapshot: {
      searchKeyword: '양말',
      averageCost: 5000,
      costRange: [4500, 5500],
      popularItems: [
        {
          imgUrl: 'https://example.com/a.png',
          name: 'item-a',
          category: '패션잡화 > 양말',
          brand: 'brand-a',
          manufacturer: 'maker-a',
          rating: 4.8,
          review: 120,
          cost: 5000,
          views: [100, 200],
        },
        {
          imgUrl: 'https://example.com/b.png',
          name: 'item-b',
          category: '패션잡화 > 양말',
          brand: 'brand-b',
          manufacturer: 'maker-b',
          rating: 4.7,
          review: 80,
          cost: 5200,
          views: [90, 190],
        },
        {
          imgUrl: 'https://example.com/c.png',
          name: 'item-c',
          category: '생활용품',
          brand: 'brand-c',
          manufacturer: 'maker-c',
          rating: 4.6,
          review: 60,
          cost: 4800,
          views: [80, 180],
        },
      ],
    },
  });

  assert.deepEqual(result.categories, ['패션잡화 > 양말', '생활용품']);
});

test('createPopupMarginCalculationResult uses production cost directly for KRW inputs', () => {
  const result = createPopupMarginCalculationResult({
    inputs: {
      productionCostCurrency: 'krw',
      productionCost: 1200,
      salesCommission: 10,
      coupangProductCost: 5000,
      inboundOutboundShippingFee: 300,
      exchangeRate: 352,
    },
    snapshot: {
      searchKeyword: '양말',
      averageCost: 5000,
      costRange: [4500, 5500],
      popularItems: [],
    },
  });

  assert.equal(result.product1688Cost, 1200);
});

test('getPopupFeedbackState gives a recovery guide when the active tab content script is missing', () => {
  const feedback = getPopupFeedbackState(
    new Error('Could not establish connection. Receiving end does not exist.'),
  );

  assert.equal(feedback.color, 'yellow');
  assert.equal(feedback.title, '탭 연결 필요');
  assert.match(feedback.message, /쿠팡 Wing 탭을 새로고침/);
});

test('getPopupFeedbackState gives the same recovery guide when content script injection is blocked', () => {
  const feedback = getPopupFeedbackState(
    new Error('현재 탭에 content script가 연결되지 않았습니다. 탭을 새로고침한 뒤 다시 시도해주세요.'),
  );

  assert.equal(feedback.color, 'yellow');
  assert.equal(feedback.title, '탭 연결 필요');
  assert.match(feedback.message, /Chrome 확장프로그램을 다시 로드/);
});
