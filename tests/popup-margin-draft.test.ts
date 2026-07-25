import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePopupMarginDraft } from '../src/pages/popup-home/model/popup-margin-draft.ts';
import { normalizeExtensionSettings } from '../src/shared/extension/storage/schema.ts';

const fallback = {
  productionCostCurrency: 'cny' as const,
  productionCost: '',
  productUrlInput: '',
  productUrls: [],
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
    productUrlInput: '',
    productUrls: ['https://detail.1688.com/offer/123.html'],
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
      productUrls: false,
    },
    fallback,
  );

  assert.deepEqual(draft, fallback);
});

test('normalizeExtensionSettings migrates the legacy product url to a list', () => {
  const settings = normalizeExtensionSettings({
    productUrl: 'https://detail.1688.com/offer/123.html',
  });

  assert.equal(settings.productUrl, 'https://detail.1688.com/offer/123.html');
  assert.deepEqual(settings.productUrls, [
    'https://detail.1688.com/offer/123.html',
  ]);
});

test('normalizeExtensionSettings preserves an explicitly cleared product url list', () => {
  const settings = normalizeExtensionSettings({
    productUrl: 'https://detail.1688.com/offer/123.html',
    productUrls: [],
  });

  assert.equal(settings.productUrl, '');
  assert.deepEqual(settings.productUrls, []);
});
