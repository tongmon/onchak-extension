import {
  DEFAULT_EXCHANGE_RATE,
  type ProductionCostCurrency,
} from '@/entities/settings';

export type { ProductionCostCurrency };

export interface PopupFormValues {
  productionCostCurrency: ProductionCostCurrency;
  productionCost: string | number;
  salesCommission: string | number;
  coupangProductCost: string | number;
  inboundOutboundShippingFee: string | number;
  exchangeRate: string | number;
}

export interface FeedbackState {
  color: 'red' | 'yellow';
  title: string;
  message: string;
}

const MISSING_INFO_MESSAGE = '특정 정보를 찾을 수 없습니다.';
const WRONG_PAGE_MESSAGE =
  '인기상품 검색 결과 페이지가 아닙니다. 해당 화면에서 다시 시도해주세요.';

export function createInitialPopupFormValues(values: {
  productionCostCurrency: ProductionCostCurrency;
  productionCost: string;
  salesCommission: string;
  coupangProductCost: string;
  inboundOutboundShippingFee: string;
  exchangeRate: string;
}): PopupFormValues {
  return {
    productionCostCurrency: values.productionCostCurrency,
    productionCost: values.productionCost,
    salesCommission: values.salesCommission,
    coupangProductCost: values.coupangProductCost,
    inboundOutboundShippingFee: values.inboundOutboundShippingFee,
    exchangeRate: values.exchangeRate,
  };
}

export function isBlankNumberInput(value: string | number): boolean {
  return typeof value === 'string' && value.trim() === '';
}

export function normalizeNumberInput(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue.replace(/,/g, ''));

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

export function normalizeExchangeRateInput(
  value: string | number,
): number | null {
  const normalizedValue = normalizeNumberInput(value);

  return normalizedValue !== null && normalizedValue > 0
    ? normalizedValue
    : null;
}

export function getAppliedExchangeRate(value: string | number): number {
  if (isBlankNumberInput(value)) {
    return DEFAULT_EXCHANGE_RATE;
  }

  return normalizeExchangeRateInput(value) ?? DEFAULT_EXCHANGE_RATE;
}

export function stringifyFieldValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : value.trim();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function formatRange(range: [number, number], suffix = ''): string {
  return `${formatCurrency(range[0])} - ${formatCurrency(range[1])}${suffix}`;
}

export function getPopupFeedbackState(error: unknown): FeedbackState {
  const message =
    error instanceof Error
      ? error.message
      : '마진률 계산을 처리하지 못했습니다.';

  if (message === WRONG_PAGE_MESSAGE) {
    return {
      color: 'yellow',
      title: '페이지 확인 필요',
      message,
    };
  }

  if (message === MISSING_INFO_MESSAGE) {
    return {
      color: 'yellow',
      title: '파싱 경고',
      message,
    };
  }

  return {
    color: 'red',
    title: '계산 실패',
    message,
  };
}
