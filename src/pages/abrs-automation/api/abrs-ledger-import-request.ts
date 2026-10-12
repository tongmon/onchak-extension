import { abrsLedgerPeriodDates, getAbrsRequiredLedgerSlots, isAbrsSettlementSlot, type AbrsLedgerDateRange, type AbrsLedgerFileEntry } from '../model/abrs-ledger-files.ts';

export const abrsLedgerImportPath = '/api/ledger/imports';
export const abrsLedgerPeriodImportPath = `${abrsLedgerImportPath}/period`;

export function buildAbrsLedgerPeriodFormData(input: BuildAbrsLedgerImportFormDataInput & {
  period: AbrsLedgerDateRange; uploadMode: 'daily' | 'monthly';
}): FormData {
  const entries = input.entries.filter((entry) => getAbrsRequiredLedgerSlots(input.period).includes(entry.slot));
  const formData = buildAbrsLedgerImportFormData({ ...input, entries });
  formData.append('ingestionMode', input.uploadMode.toUpperCase());
  formData.append('periodStart', input.period.start);
  formData.append('periodEnd', input.period.end);
  formData.append('sourcePeriods', JSON.stringify(entries
    .filter((entry) => isAbrsSettlementSlot(entry.slot) && entry.dateRange)
    .map((entry) => ({ fileName: entry.file.name, periodStart: entry.dateRange!.start, periodEnd: entry.dateRange!.end }))));
  return formData;
}

/** Do not evict local originals unless the server confirms every selected date. */
export function assertAbrsLedgerPeriodReceipt(
  response: Record<string, unknown>, period: AbrsLedgerDateRange, uploadMode: 'daily' | 'monthly',
): number {
  const dates = abrsLedgerPeriodDates(period);
  const imports = Array.isArray(response.imports) ? response.imports.map(getRecord) : [];
  if (!dates.length || response.status !== 'IMPORTED' || response.ingestionMode !== uploadMode.toUpperCase()
    || response.periodStart !== period.start || response.periodEnd !== period.end
    || imports.length !== dates.length || new Set(imports.map((item) => item?.targetDate)).size !== dates.length
    || new Set(imports.map((item) => item?.importId)).size !== dates.length
    || imports.some((item) => !item || typeof item.importId !== 'string' || !item.importId.trim()
      || item.status !== 'IMPORTED' || !dates.includes(item.targetDate as string))
    || response.importId !== imports.find((item) => item?.targetDate === period.end)?.importId) {
    throw new Error('선택 기간의 일별 장부 접수를 모두 확인하지 못했습니다. 파일은 보관되어 있습니다. 웹에서 접수 여부를 확인해 주세요.');
  }
  return imports.length;
}

export interface BuildAbrsLedgerImportFormDataInput {
  targetDate: string;
  batchName: string;
  entries: AbrsLedgerFileEntry[];
  selectedSellerId?: string;
}

export interface AbrsLedgerImportAuthHeadersInput {
  accessToken: string;
  csrfToken?: string | null;
  tokenType?: string | null;
}

export type AbrsLedgerImportHeaders = {
  Accept: string;
  Authorization: string;
  'X-Requested-With': string;
  'X-CSRF-Token'?: string;
};

export function buildAbrsLedgerImportUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
}

export function buildAbrsLedgerImportFormData({
  targetDate,
  batchName,
  entries,
  selectedSellerId,
}: BuildAbrsLedgerImportFormDataInput): FormData {
  const formData = new FormData();

  formData.append('targetDate', targetDate);
  formData.append('batchName', batchName);
  if (selectedSellerId) formData.append('selectedSellerId', selectedSellerId);

  for (const entry of entries) {
    formData.append('files', entry.file, entry.file.name);
  }

  return formData;
}

export function createAbrsLedgerImportHeaders({
  accessToken,
  csrfToken,
  tokenType,
}: AbrsLedgerImportAuthHeadersInput): AbrsLedgerImportHeaders {
  return {
    Accept: 'application/json',
    Authorization: `${tokenType || 'Bearer'} ${accessToken}`,
    'X-Requested-With': 'XMLHttpRequest',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  };
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedRecord(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  return getRecord(record?.[key]);
}

export function extractAbrsLedgerImportErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  const record = getRecord(payload);

  if (!record) {
    return fallback;
  }

  const candidates = [
    record.message,
    record.error,
    getNestedRecord(record, 'data')?.message,
    getNestedRecord(record, 'data')?.error,
  ];
  const firstMessage = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );

  return firstMessage ?? fallback;
}
