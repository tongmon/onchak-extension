import assert from 'node:assert/strict';
import test from 'node:test';
import { createPopupMarginCalculationResult } from '../src/pages/popup-home/model/popup-margin-result.ts';

test('createPopupMarginCalculationResult includes unique popular item categories', () => {
  const result = createPopupMarginCalculationResult({
    inputs: {
      productionCost: 1000,
      salesCommission: 10,
      coupangProductCost: 5000,
      inboundOutboundShippingFee: 300,
      overseasShippingFee: 1.2,
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
