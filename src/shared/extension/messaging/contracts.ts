import type { ExtensionSettings } from '../storage/schema';

export interface ActiveTabSnapshot {
  tabId: number | null;
  tabTitle: string | null;
  tabUrl: string | null;
  pageTitle: string | null;
  contentScriptConnected: boolean;
  overlayEnabled: boolean;
}

export interface ExtensionContext {
  extensionVersion: string;
  handledAt: string;
  storageArea: 'sync';
  activeTab: ActiveTabSnapshot;
}

export interface PopularItemSnapshot {
  imgUrl: string;
  name: string;
  category: string;
  brand: string;
  manufacturer: string;
  rating: number;
  review: number;
  cost: number;
  views: [number, number];
}

export interface PopularSearchSnapshot {
  searchKeyword: string;
  averageCost: number | null;
  costRange: [number, number] | null;
  popularItems: PopularItemSnapshot[];
}

export type AbrsCoupangSurface =
  | 'wing-inventory'
  | 'wing-sales'
  | 'ads-center'
  | 'wing'
  | 'unknown';

export interface AbrsCoupangPageSnapshot {
  href: string;
  title: string;
  surface: AbrsCoupangSurface;
  sellerId?: string;
}

export type AbrsCoupangLedgerDownloadSlot =
  | 'inventoryHealth'
  | 'salesStatistics'
  | 'adPerformance'
  | 'dailySettlement'
  | 'productList'
  | 'CATEGORY_TR'
  | 'WAREHOUSING_SHIPPING'
  | 'STORAGE_FEE'
  | 'CRETURN_PICKUP_RESTOCKING'
  | 'VRETURN_HANDLING'
  | 'VRETURN_SHIPPING'
  | 'INVENTORY_COMPENSATION'
  | 'VALUE_ADDED_SERVICE_FEE'
  | 'PPIR';

export type AbrsLedgerFileSlot = AbrsCoupangLedgerDownloadSlot | 'productList';

export type AbrsLedgerSourceType =
  | 'COUPANG_INVENTORY_HEALTH'
  | 'COUPANG_SALES_STATISTICS'
  | 'COUPANG_AD_PERFORMANCE'
  | 'COUPANG_DAILY_SETTLEMENT'
  | 'COUPANG_PRICE_INVENTORY'
  | 'COUPANG_CATEGORY_TRANSACTION'
  | 'COUPANG_WAREHOUSING_SHIPPING'
  | 'COUPANG_STORAGE_FEE'
  | 'COUPANG_CUSTOMER_RETURN'
  | 'COUPANG_VENDOR_RETURN_HANDLING'
  | 'COUPANG_VENDOR_RETURN_SHIPPING'
  | 'COUPANG_INVENTORY_COMPENSATION'
  | 'COUPANG_VALUE_ADDED_SERVICE_FEE'
  | 'COUPANG_PPIR';

export interface AbrsLedgerDateRange {
  start: string;
  end: string;
}

export interface AbrsLedgerPeriodRequest {
  targetDate: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface AbrsCoupangLedgerDownloadRequest extends AbrsLedgerPeriodRequest {
  slot: AbrsCoupangLedgerDownloadSlot;
  expectedSellerId?: string;
}

export function resolveAbrsLedgerPeriod(
  request: AbrsLedgerPeriodRequest,
): AbrsLedgerDateRange {
  const start = request.periodStart ?? request.targetDate;
  const end = request.periodEnd ?? request.targetDate;
  for (const value of [request.targetDate, start, end]) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new Error('장부 날짜 형식이 올바르지 않습니다.');
    }
  }
  if (start > end) {
    throw new Error('조회 시작일은 종료일보다 늦을 수 없습니다.');
  }
  return { start, end };
}

export interface AbrsCoupangLedgerDownload {
  slot: AbrsCoupangLedgerDownloadSlot;
  fileName: string;
  mimeType: string;
  base64: string;
  sourcePeriod?: AbrsLedgerDateRange;
  sellerId?: string;
}

export interface AbrsCoupangOriginalDownloadRequest {
  slot: AbrsCoupangLedgerDownloadSlot;
  url: string;
}

export type AbrsCoupangLedgerDownloadResult =
  | AbrsCoupangLedgerDownload
  | AbrsCoupangLedgerDownload[];

export function normalizeAbrsCoupangDownloads(
  result: AbrsCoupangLedgerDownloadResult,
): AbrsCoupangLedgerDownload[] {
  return Array.isArray(result) ? result : [result];
}

export interface AbrsLedgerPersistedEntry {
  slot: AbrsLedgerFileSlot;
  sourceType: AbrsLedgerSourceType;
  label: string;
  dateRange: AbrsLedgerDateRange | null;
  fileName: string;
  mimeType: string;
  base64: string;
  size: number;
  savedAt: string;
  collectionVersion?: number;
  sellerId?: string;
}

export interface AbrsLedgerBatch {
  targetDate: string;
  periodStart?: string;
  periodEnd?: string;
  updatedAt: string | null;
  entries: AbrsLedgerPersistedEntry[];
}

export interface AbrsLedgerOriginalSignature {
  slot: AbrsLedgerFileSlot;
  canonicalFileName: string;
  contentSha256: string;
  dateRange: AbrsLedgerDateRange | null;
  sellerId?: string;
}

export interface AbrsLedgerDownloadSlotStatus {
  slot: AbrsCoupangLedgerDownloadSlot;
  status: 'downloaded' | 'failed';
  fileName?: string;
  fileNames?: string[];
  fileCount?: number;
  error?: string;
  tabUrl?: string;
}

export interface AbrsLedgerSelectedTargetDate {
  targetDate: string;
  uploadMode?: 'daily' | 'monthly';
}

export interface RuntimeMessageMap {
  'system/get-extension-context': {
    request: undefined;
    response: ExtensionContext;
  };
  'page/get-active-tab-popular-search-data': {
    request: undefined;
    response: PopularSearchSnapshot;
  };
  'page/set-active-tab-overlay': {
    request: { enabled: boolean };
    response: {
      applied: boolean;
      tabId: number | null;
      contentScriptConnected: boolean;
    };
  };
  'abrs/get-active-tab-coupang-page': {
    request: undefined;
    response: AbrsCoupangPageSnapshot;
  };
  'abrs/get-wing-seller': {
    request: undefined;
    response: { sellerId: string };
  };
  'abrs/download-active-tab-ledger-file': {
    request: AbrsCoupangLedgerDownloadRequest;
    response: AbrsCoupangLedgerDownloadResult;
  };
  'abrs/download-coupang-original': {
    request: AbrsCoupangOriginalDownloadRequest;
    response: AbrsCoupangLedgerDownload;
  };
  'abrs/get-ledger-batch': {
    request: AbrsLedgerPeriodRequest;
    response: AbrsLedgerBatch;
  };
  'abrs/save-ledger-batch-files': {
    request: AbrsLedgerPeriodRequest & {
      entries: AbrsLedgerPersistedEntry[];
      replaceSlots?: AbrsCoupangLedgerDownloadSlot[];
    };
    response: AbrsLedgerBatch;
  };
  'abrs/clear-ledger-batch': {
    request: AbrsLedgerPeriodRequest & {
      expectedAccountScope?: string;
      expectedOriginals?: AbrsLedgerOriginalSignature[];
    };
    response: AbrsLedgerBatch;
  };
  'abrs/download-all-ledger-files': {
    request: AbrsLedgerPeriodRequest;
    response: {
      batch: AbrsLedgerBatch;
      statuses: AbrsLedgerDownloadSlotStatus[];
    };
  };
  'abrs/download-cached-ledger-file': {
    request: AbrsLedgerPeriodRequest & {
      slot: AbrsLedgerFileSlot;
      fileName?: string;
    };
    response: {
      downloadId: number;
      fileName: string;
    };
  };
  'abrs/get-ledger-target-date': {
    request: { fallbackDate: string };
    response: AbrsLedgerSelectedTargetDate;
  };
  'abrs/save-ledger-target-date': {
    request: AbrsLedgerSelectedTargetDate;
    response: AbrsLedgerSelectedTargetDate;
  };
}

export interface TabMessageMap {
  'page/get-dom-snapshot': {
    request: undefined;
    response: {
      title: string;
      href: string;
      overlayEnabled: boolean;
    };
  };
  'page/get-popular-search-data': {
    request: undefined;
    response: PopularSearchSnapshot;
  };
  'page/set-overlay': {
    request: { enabled: boolean };
    response: {
      overlayEnabled: boolean;
    };
  };
  'abrs/get-coupang-page': {
    request: undefined;
    response: AbrsCoupangPageSnapshot;
  };
  'abrs/download-ledger-file': {
    request: AbrsCoupangLedgerDownloadRequest;
    response: AbrsCoupangLedgerDownloadResult;
  };
}

export interface MessageSuccess<T> {
  ok: true;
  data: T;
}

export interface MessageFailure {
  ok: false;
  error: string;
}

export type MessageResult<T> = MessageSuccess<T> | MessageFailure;

type MessageShape<
  TType extends string,
  TPayload,
> = TPayload extends undefined
  ? { type: TType; payload?: never }
  : { type: TType; payload: TPayload };

export type RuntimeMessageType = keyof RuntimeMessageMap;
export type TabMessageType = keyof TabMessageMap;

export type RuntimeMessage<T extends RuntimeMessageType = RuntimeMessageType> =
  MessageShape<T, RuntimeMessageMap[T]['request']>;

export type TabMessage<T extends TabMessageType = TabMessageType> =
  MessageShape<T, TabMessageMap[T]['request']>;

export function messageSuccess<T>(data: T): MessageSuccess<T> {
  return { ok: true, data };
}

export function messageFailure(error: unknown): MessageFailure {
  return {
    ok: false,
    error:
      error instanceof Error ? error.message : 'Unknown extension bridge error.',
  };
}

export type { ExtensionSettings };
