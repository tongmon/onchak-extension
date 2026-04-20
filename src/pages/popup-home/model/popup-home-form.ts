import type { MarginCalculationResponse } from '../api/request-margin-calculation-mutation';

export interface PopupFormValues {
  coupangProductUrl: string;
  product1688Url: string;
  salesCommission: string | number;
  inboundOutboundShippingFee: string | number;
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
  coupangProductUrl: string;
  product1688Url: string;
  salesCommission: string;
  inboundOutboundShippingFee: string;
}): PopupFormValues {
  return {
    coupangProductUrl: values.coupangProductUrl,
    product1688Url: values.product1688Url,
    salesCommission: values.salesCommission,
    inboundOutboundShippingFee: values.inboundOutboundShippingFee,
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
      : '마진률 계산 요청을 처리하지 못했습니다.';

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
    title: '계산 요청 실패',
    message,
  };
}

export function getResponsePreview(
  response: MarginCalculationResponse | undefined,
): string | null {
  if (!response) {
    return null;
  }

  return JSON.stringify(response, null, 2);
}
