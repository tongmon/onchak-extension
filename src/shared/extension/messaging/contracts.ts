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
}

export type AbrsCoupangLedgerDownloadSlot =
  | 'inventoryHealth'
  | 'salesStatistics'
  | 'dailySettlement';

export type AbrsLedgerSourceType =
  | 'COUPANG_INVENTORY_HEALTH'
  | 'COUPANG_SALES_STATISTICS'
  | 'COUPANG_DAILY_SETTLEMENT';

export interface AbrsLedgerDateRange {
  start: string;
  end: string;
}

export interface AbrsCoupangLedgerDownloadRequest {
  slot: AbrsCoupangLedgerDownloadSlot;
  targetDate: string;
}

export interface AbrsCoupangLedgerDownload {
  slot: AbrsCoupangLedgerDownloadSlot;
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface AbrsLedgerPersistedEntry {
  slot: AbrsCoupangLedgerDownloadSlot;
  sourceType: AbrsLedgerSourceType;
  label: string;
  dateRange: AbrsLedgerDateRange | null;
  fileName: string;
  mimeType: string;
  base64: string;
  size: number;
  savedAt: string;
}

export interface AbrsLedgerBatch {
  targetDate: string;
  updatedAt: string | null;
  entries: AbrsLedgerPersistedEntry[];
}

export interface AbrsLedgerDownloadSlotStatus {
  slot: AbrsCoupangLedgerDownloadSlot;
  status: 'downloaded' | 'failed';
  fileName?: string;
  error?: string;
  tabUrl?: string;
}

export interface AbrsLedgerSelectedTargetDate {
  targetDate: string;
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
  'abrs/download-active-tab-ledger-file': {
    request: AbrsCoupangLedgerDownloadRequest;
    response: AbrsCoupangLedgerDownload;
  };
  'abrs/get-ledger-batch': {
    request: { targetDate: string };
    response: AbrsLedgerBatch;
  };
  'abrs/save-ledger-batch-files': {
    request: {
      targetDate: string;
      entries: AbrsLedgerPersistedEntry[];
    };
    response: AbrsLedgerBatch;
  };
  'abrs/clear-ledger-batch': {
    request: { targetDate: string };
    response: AbrsLedgerBatch;
  };
  'abrs/download-all-ledger-files': {
    request: { targetDate: string };
    response: {
      batch: AbrsLedgerBatch;
      statuses: AbrsLedgerDownloadSlotStatus[];
    };
  };
  'abrs/get-ledger-target-date': {
    request: { fallbackDate: string };
    response: AbrsLedgerSelectedTargetDate;
  };
  'abrs/save-ledger-target-date': {
    request: { targetDate: string };
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
    response: AbrsCoupangLedgerDownload;
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
