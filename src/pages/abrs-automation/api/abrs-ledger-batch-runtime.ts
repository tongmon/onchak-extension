import {
  sendRuntimeMessage,
  type AbrsLedgerBatch,
  type AbrsLedgerDownloadSlotStatus,
  type AbrsLedgerPersistedEntry,
  type AbrsLedgerOriginalSignature,
  type AbrsLedgerSelectedTargetDate,
  type AbrsCoupangLedgerDownloadSlot,
} from '@/shared/extension';

export interface DownloadAllAbrsLedgerFilesResult {
  batch: AbrsLedgerBatch;
  statuses: AbrsLedgerDownloadSlotStatus[];
}

export interface AbrsLedgerBatchPeriod { periodStart?: string; periodEnd?: string; }

export function getAbrsWingSeller(): Promise<{ sellerId: string }> {
  return sendRuntimeMessage({ type: 'abrs/get-wing-seller' });
}

export function getAbrsLedgerBatch(targetDate: string, period: AbrsLedgerBatchPeriod = {}): Promise<AbrsLedgerBatch> {
  return sendRuntimeMessage({
    type: 'abrs/get-ledger-batch',
    payload: { targetDate, ...period },
  });
}

export function saveAbrsLedgerBatchFiles(params: {
  targetDate: string;
  entries: AbrsLedgerPersistedEntry[];
  periodStart?: string;
  periodEnd?: string;
  replaceSlots?: AbrsCoupangLedgerDownloadSlot[];
}): Promise<AbrsLedgerBatch> {
  return sendRuntimeMessage({
    type: 'abrs/save-ledger-batch-files',
    payload: params,
  });
}

export function clearAbrsLedgerBatch(targetDate: string, period: AbrsLedgerBatchPeriod & {
  expectedAccountScope?: string;
  expectedOriginals?: AbrsLedgerOriginalSignature[];
} = {}): Promise<AbrsLedgerBatch> {
  return sendRuntimeMessage({
    type: 'abrs/clear-ledger-batch',
    payload: { targetDate, ...period },
  });
}

export function downloadAllAbrsLedgerFiles(
  targetDate: string,
  period: AbrsLedgerBatchPeriod = {},
): Promise<DownloadAllAbrsLedgerFilesResult> {
  return sendRuntimeMessage({
    type: 'abrs/download-all-ledger-files',
    payload: { targetDate, ...period },
  });
}

export function downloadCachedAbrsLedgerFile(params: {
  targetDate: string;
  slot: AbrsLedgerPersistedEntry['slot'];
  fileName?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<{ downloadId: number; fileName: string }> {
  return sendRuntimeMessage({
    type: 'abrs/download-cached-ledger-file',
    payload: params,
  });
}

export function getAbrsLedgerSelectedTargetDate(
  fallbackDate: string,
): Promise<AbrsLedgerSelectedTargetDate> {
  return sendRuntimeMessage({
    type: 'abrs/get-ledger-target-date',
    payload: { fallbackDate },
  });
}

export function saveAbrsLedgerSelectedTargetDate(
  targetDate: string,
  uploadMode?: 'daily' | 'monthly',
): Promise<AbrsLedgerSelectedTargetDate> {
  return sendRuntimeMessage({
    type: 'abrs/save-ledger-target-date',
    payload: { targetDate, uploadMode },
  });
}
