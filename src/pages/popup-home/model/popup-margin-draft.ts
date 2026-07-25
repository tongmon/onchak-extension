import type { PopupFormValues } from './popup-home-form';
import { normalizeProductUrls } from './popup-home-form.ts';

export const POPUP_MARGIN_DRAFT_STORAGE_KEY = 'popupMarginCalculatorDraft';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeDraftField(
  value: unknown,
  fallback: string | number,
): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return String(fallback);
}

function normalizeDraftProductUrls(
  draft: Record<string, unknown>,
  fallback: PopupFormValues,
): string[] {
  if (Array.isArray(draft.productUrls)) {
    return normalizeProductUrls(draft.productUrls);
  }

  const legacyProductUrl =
    typeof draft.productUrl === 'string'
      ? draft.productUrl
      : typeof draft.productSourceUrl === 'string'
        ? draft.productSourceUrl
        : null;

  if (legacyProductUrl !== null) {
    return normalizeProductUrls([legacyProductUrl]);
  }

  return normalizeProductUrls(fallback.productUrls);
}

export function normalizePopupMarginDraft(
  value: unknown,
  fallback: PopupFormValues,
): PopupFormValues {
  const draft = isRecord(value) ? value : {};

  return {
    productionCostCurrency:
      draft.productionCostCurrency === 'krw' ||
      draft.productionCostCurrency === 'cny'
        ? draft.productionCostCurrency
        : fallback.productionCostCurrency,
    productionCost: normalizeDraftField(
      draft.productionCost,
      fallback.productionCost,
    ),
    productUrlInput: normalizeDraftField(
      draft.productUrlInput,
      fallback.productUrlInput,
    ),
    productUrls: normalizeDraftProductUrls(draft, fallback),
    salesCommission: normalizeDraftField(
      draft.salesCommission,
      fallback.salesCommission,
    ),
    coupangProductCost: normalizeDraftField(
      draft.coupangProductCost,
      fallback.coupangProductCost,
    ),
    inboundOutboundShippingFee: normalizeDraftField(
      draft.inboundOutboundShippingFee,
      fallback.inboundOutboundShippingFee,
    ),
    exchangeRate: normalizeDraftField(
      draft.exchangeRate,
      fallback.exchangeRate,
    ),
  };
}

export async function loadPopupMarginDraft(
  fallback: PopupFormValues,
): Promise<PopupFormValues> {
  const stored = (await chrome.storage.local.get([
    POPUP_MARGIN_DRAFT_STORAGE_KEY,
  ])) as Record<string, unknown>;

  return normalizePopupMarginDraft(
    stored[POPUP_MARGIN_DRAFT_STORAGE_KEY],
    fallback,
  );
}

export async function savePopupMarginDraft(
  values: PopupFormValues,
): Promise<void> {
  await chrome.storage.local.set({
    [POPUP_MARGIN_DRAFT_STORAGE_KEY]: normalizePopupMarginDraft(values, values),
  });
}
