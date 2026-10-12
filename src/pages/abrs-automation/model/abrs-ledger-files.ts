import type {
  AbrsCoupangLedgerDownloadSlot,
  AbrsLedgerSourceType as SourceType,
} from '../../../shared/extension/messaging/contracts.ts';
import { getAbrsCoupangFileSourcePeriod, getAbrsCoupangFileSellerId } from '../api/abrs-coupang-download-file.ts';

export type AbrsLedgerFileSlot = AbrsCoupangLedgerDownloadSlot;
export type AbrsLedgerSourceType = SourceType;
export interface AbrsLedgerDateRange { start: string; end: string; }
export interface AbrsLedgerFileClassification {
  slot: AbrsLedgerFileSlot;
  sourceType: AbrsLedgerSourceType;
  label: string;
  dateRange: AbrsLedgerDateRange | null;
}
export interface AbrsLedgerFileEntry extends AbrsLedgerFileClassification { file: File; sellerId?: string; }
export interface AbrsLedgerValidationResult { ok: boolean; messages: string[]; }

export const ABRS_SETTLEMENT_SLOTS = [
  'CATEGORY_TR', 'WAREHOUSING_SHIPPING', 'STORAGE_FEE',
  'CRETURN_PICKUP_RESTOCKING', 'VRETURN_HANDLING', 'VRETURN_SHIPPING',
  'INVENTORY_COMPENSATION', 'VALUE_ADDED_SERVICE_FEE', 'PPIR',
] as const;

export const ABRS_LEDGER_SLOT_DEFINITIONS: Record<
  AbrsLedgerFileSlot, Pick<AbrsLedgerFileClassification, 'sourceType' | 'label'>
> = {
  inventoryHealth: { sourceType: 'COUPANG_INVENTORY_HEALTH', label: '재고 현황' },
  salesStatistics: { sourceType: 'COUPANG_SALES_STATISTICS', label: '판매 현황' },
  dailySettlement: { sourceType: 'COUPANG_DAILY_SETTLEMENT', label: '광고비/정산' },
  productList: { sourceType: 'COUPANG_PRICE_INVENTORY', label: '상품 리스트' },
  adPerformance: { sourceType: 'COUPANG_AD_PERFORMANCE', label: '광고 성과' },
  CATEGORY_TR: { sourceType: 'COUPANG_CATEGORY_TRANSACTION', label: '주문·판매수수료' },
  WAREHOUSING_SHIPPING: { sourceType: 'COUPANG_WAREHOUSING_SHIPPING', label: '입출고·배송비' },
  STORAGE_FEE: { sourceType: 'COUPANG_STORAGE_FEE', label: '보관비' },
  CRETURN_PICKUP_RESTOCKING: { sourceType: 'COUPANG_CUSTOMER_RETURN', label: '반품 회수·재입고비' },
  VRETURN_HANDLING: { sourceType: 'COUPANG_VENDOR_RETURN_HANDLING', label: '반출비' },
  VRETURN_SHIPPING: { sourceType: 'COUPANG_VENDOR_RETURN_SHIPPING', label: '반출 배송비' },
  INVENTORY_COMPENSATION: { sourceType: 'COUPANG_INVENTORY_COMPENSATION', label: '재고 손실 보상' },
  VALUE_ADDED_SERVICE_FEE: { sourceType: 'COUPANG_VALUE_ADDED_SERVICE_FEE', label: '부가서비스비' },
  PPIR: { sourceType: 'COUPANG_PPIR', label: '리뷰 이벤트 비용' },
};

export const ABRS_REQUIRED_LEDGER_SLOTS: AbrsLedgerFileSlot[] = [
  'inventoryHealth', 'salesStatistics', 'adPerformance', 'productList',
  ...ABRS_SETTLEMENT_SLOTS,
];

export const ABRS_DAILY_LEDGER_SLOTS = ABRS_REQUIRED_LEDGER_SLOTS.slice(0, 4);

export function getAbrsRequiredLedgerSlots(period?: AbrsLedgerDateRange): AbrsLedgerFileSlot[] {
  return period?.start === period?.end && period !== undefined
    ? [...ABRS_DAILY_LEDGER_SLOTS] : [...ABRS_REQUIRED_LEDGER_SLOTS];
}

export function abrsLedgerPeriodDates(period: AbrsLedgerDateRange): string[] {
  if (!formatCompactDate(period.start.replaceAll('-', '')) || !formatCompactDate(period.end.replaceAll('-', ''))
    || period.start > period.end || period.start.slice(0, 7) !== period.end.slice(0, 7)) return [];
  const dates: string[] = [];
  for (let day = period.start; day <= period.end;) {
    dates.push(day);
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return dates;
}

export function isAbrsLedgerSlotPeriodComplete(
  entries: Pick<AbrsLedgerFileEntry, 'slot' | 'dateRange'>[], slot: AbrsLedgerFileSlot, period: AbrsLedgerDateRange,
): boolean {
  const files = entries.filter((entry) => entry.slot === slot);
  if (!files.length) return false;
  if (slot === 'inventoryHealth' || slot === 'productList') return true;
  const ranges = files.map((entry) => entry.dateRange);
  if (ranges.some((range) => !range || range.start < period.start || range.end > period.end || range.start > range.end)) return false;
  if (slot === 'adPerformance') return ranges.every((range) => range!.start === period.start && range!.end === period.end);
  if (slot === 'salesStatistics' && ranges.some((range) => range!.start !== range!.end)) return false;
  const dates = abrsLedgerPeriodDates(period);
  return dates.length > 0 && dates.every((date) => ranges.some((range) => range!.start <= date && range!.end >= date));
}

export function isAbrsSettlementSlot(slot: AbrsLedgerFileSlot): boolean {
  return (ABRS_SETTLEMENT_SLOTS as readonly string[]).includes(slot);
}

function formatCompactDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const formatted = `${year}-${month}-${day}`;
  const parsed = new Date(`${formatted}T00:00:00.000Z`);
  return parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day) ? formatted : null;
}

function createDateRange(startCompact: string, endCompact: string): AbrsLedgerDateRange | null {
  const start = formatCompactDate(startCompact);
  const end = formatCompactDate(endCompact);
  return start && end && start <= end ? { start, end } : null;
}

function createClassification(slot: AbrsLedgerFileSlot, dateRange: AbrsLedgerDateRange | null): AbrsLedgerFileClassification {
  return { slot, ...ABRS_LEDGER_SLOT_DEFINITIONS[slot], dateRange };
}

function filenameRange(name: string): AbrsLedgerDateRange | null {
  const match = name.match(/(20\d{6})[~_-](20\d{6})/);
  return match ? createDateRange(match[1], match[2]) : null;
}

export function classifyAbrsLedgerFile(fileName: string): AbrsLedgerFileClassification | null {
  const name = fileName.trim();
  if (!/\.xlsx$/i.test(name)) return null;
  if (/^inventory_health_sku_info_\d{14}(?:\s*\(\d+\))?\.xlsx$/i.test(name)) {
    return createClassification('inventoryHealth', null);
  }
  if (/^price_inventory_.+\.xlsx$/i.test(name)) return createClassification('productList', null);
  const statistics = name.match(/^statistics-(\d{8})~(\d{8})(?:_\(\d+\))?(?:\s*\(\d+\))?\.xlsx$/i);
  if (statistics) {
    const range = createDateRange(statistics[1], statistics[2]);
    return range ? createClassification('salesStatistics', range) : null;
  }
  const legacy = name.match(/^.+-dailysettlement-(\d{8})-(\d{8})(?:\s*\(\d+\))?\.xlsx$/i);
  if (legacy) {
    const range = createDateRange(legacy[1], legacy[2]);
    return range ? createClassification('dailySettlement', range) : null;
  }
  if (/(?:^|[_-])pa_daily_vendoritem(?:[_-]|\.)/i.test(name)) {
    return createClassification('adPerformance', filenameRange(name));
  }
  if (/(?:^|[_-])BARCODE_LABELING_FEE(?:[_-]|\.)/i.test(name)) {
    return createClassification('VALUE_ADDED_SERVICE_FEE', filenameRange(name));
  }
  for (const slot of ABRS_SETTLEMENT_SLOTS) {
    if (new RegExp(`(?:^|[_-])${slot}(?:[_-]|\\.)`, 'i').test(name)) {
      return createClassification(slot, filenameRange(name));
    }
  }
  return null;
}

/** Keep distinct original chunks; Chrome's copy suffix identifies a refreshed copy. */
export function abrsLedgerEntryIdentity(slot: AbrsLedgerFileSlot, fileName: string): string {
  const originalName = fileName.replace(/\s+\(\d+\)(?=\.xlsx$)/i, '');
  return isAbrsSettlementSlot(slot) || slot === 'salesStatistics' ? `${slot}:${originalName}` : slot;
}

export function upsertAbrsLedgerFiles(existing: AbrsLedgerFileEntry[], files: File[], targetDate: string): AbrsLedgerFileEntry[] {
  void targetDate;
  return files.reduce<AbrsLedgerFileEntry[]>((entries, file) => {
    const classification = classifyAbrsLedgerFile(file.name);
    if (!classification) return entries;
    const identity = abrsLedgerEntryIdentity(classification.slot, file.name);
    const index = entries.findIndex((entry) => abrsLedgerEntryIdentity(entry.slot, entry.file.name) === identity);
    const next = { ...classification, dateRange: getAbrsCoupangFileSourcePeriod(file) ?? classification.dateRange, file,
      ...(getAbrsCoupangFileSellerId(file) ? { sellerId: getAbrsCoupangFileSellerId(file) } : {}) };
    if (index < 0) return [...entries, next];
    return entries.map((entry, candidate) => candidate === index ? next : entry);
  }, [...existing]);
}

export function validateAbrsLedgerPeriod(targetDate: string, period?: AbrsLedgerDateRange): string[] {
  const messages: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !formatCompactDate(targetDate.replaceAll('-', ''))) {
    messages.push('올바른 장부 날짜를 선택해주세요.');
  }
  if (period && (!formatCompactDate(period.start.replaceAll('-', '')) || !formatCompactDate(period.end.replaceAll('-', ''))
    || period.start > period.end || period.start.slice(0, 7) !== period.end.slice(0, 7)
    || targetDate.slice(0, 7) !== period.start.slice(0, 7))) {
    messages.push('조회 기간과 장부 날짜는 같은 월이어야 하며, 시작일은 종료일보다 늦을 수 없습니다.');
  }
  return messages;
}

export function validateAbrsLedgerFiles(
  entries: AbrsLedgerFileEntry[], targetDate: string, period?: AbrsLedgerDateRange,
): AbrsLedgerValidationResult {
  const messages = validateAbrsLedgerPeriod(targetDate, period);
  for (const slot of getAbrsRequiredLedgerSlots(period)) {
    if (!entries.some((entry) => entry.slot === slot)) messages.push(`${ABRS_LEDGER_SLOT_DEFINITIONS[slot].label} 파일을 추가해주세요.`);
  }
  if (period && entries.some((entry) => entry.slot === 'salesStatistics')
    && !isAbrsLedgerSlotPeriodComplete(entries, 'salesStatistics', period)) {
    messages.push('판매 현황은 선택 기간의 모든 날짜별 Statistics 원본이 필요합니다. 월 합계 파일은 일별 장부로 나눌 수 없으므로 다시 가져와 주세요.');
  }
  if (period && period.start !== period.end) {
    for (const slot of ABRS_SETTLEMENT_SLOTS) {
      if (entries.some((entry) => entry.slot === slot) && !isAbrsLedgerSlotPeriodComplete(entries, slot, period)) {
        messages.push(`${ABRS_LEDGER_SLOT_DEFINITIONS[slot].label}의 전체 정산 기간을 확인할 수 없습니다. 해당 월의 모든 정산 건을 다시 가져와 주세요.`);
      }
    }
  }
  for (const entry of entries) {
    const range = entry.dateRange;
    if (!range) continue;
    const correctRange = period && entry.slot === 'salesStatistics'
      ? range.start === range.end && range.start >= period.start && range.end <= period.end
      : period && !isAbrsSettlementSlot(entry.slot)
      ? range.start === period.start && range.end === period.end
      : isAbrsSettlementSlot(entry.slot)
        ? range.start.slice(0, 7) === targetDate.slice(0, 7) && range.end.slice(0, 7) === targetDate.slice(0, 7)
        : range.start === targetDate && range.end === targetDate;
    if (!correctRange) messages.push(`${entry.label} 파일 날짜(${range.start}~${range.end})가 선택 기간(${period?.start ?? targetDate}~${period?.end ?? targetDate})와 다릅니다.`);
  }
  return { ok: messages.length === 0, messages };
}

export function previousCompleteMonth(now = new Date()): AbrsLedgerDateRange {
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), end: localDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

export function createAbrsLedgerBatchName(targetDate: string): string { return `abrs-${targetDate}`; }
