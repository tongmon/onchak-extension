import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePopupMarginDraft } from '../src/pages/popup-home/model/popup-margin-draft.ts';

const fallback = {
  productionCostCurrency: 'cny' as const,
  productionCost: '',
  productUrl: '',
  salesCommission: '10.8',
  coupangProductCost: '',
  inboundOutboundShippingFee: '',
  exchangeRate: '352',
};

test('normalizePopupMarginDraft restores cached margin calculator inputs', () => {
  const draft = normalizePopupMarginDraft(
    {
      productionCostCurrency: 'krw',
      productionCost: 12500,
      salesCommission: '9.9',
      coupangProductCost: '22900',
      inboundOutboundShippingFee: '1800',
      exchangeRate: '365',
      productSourceUrl: 'https://detail.1688.com/offer/123.html',
    },
    fallback,
  );

  assert.deepEqual(draft, {
    productionCostCurrency: 'krw',
    productionCost: '12500',
    productUrl: 'https://detail.1688.com/offer/123.html',
    salesCommission: '9.9',
    coupangProductCost: '22900',
    inboundOutboundShippingFee: '1800',
    exchangeRate: '365',
  });
});

test('normalizePopupMarginDraft falls back for malformed values', () => {
  const draft = normalizePopupMarginDraft(
    {
      productionCostCurrency: 'usd',
      productionCost: null,
      productUrl: false,
    },
    fallback,
  );

  assert.deepEqual(draft, fallback);
});
