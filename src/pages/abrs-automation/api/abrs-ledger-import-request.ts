import type { AbrsLedgerFileEntry } from '../model/abrs-ledger-files';

export const abrsLedgerImportPath = '/api/ledger/imports';

export interface BuildAbrsLedgerImportFormDataInput {
  targetDate: string;
  batchName: string;
  entries: AbrsLedgerFileEntry[];
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
}: BuildAbrsLedgerImportFormDataInput): FormData {
  const formData = new FormData();

  formData.append('targetDate', targetDate);
  formData.append('batchName', batchName);

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
