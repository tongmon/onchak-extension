import {
  sendRuntimeMessage,
  type AbrsLedgerBatch,
  type AbrsLedgerDownloadSlotStatus,
  type AbrsLedgerPersistedEntry,
  type AbrsLedgerSelectedTargetDate,
} from '@/shared/extension';

export interface DownloadAllAbrsLedgerFilesResult {
  batch: AbrsLedgerBatch;
  statuses: AbrsLedgerDownloadSlotStatus[];
}

export function getAbrsLedgerBatch(targetDate: string): Promise<AbrsLedgerBatch> {
  return sendRuntimeMessage({
    type: 'abrs/get-ledger-batch',
    payload: { targetDate },
  });
}

export function saveAbrsLedgerBatchFiles(params: {
  targetDate: string;
  entries: AbrsLedgerPersistedEntry[];
}): Promise<AbrsLedgerBatch> {
  return sendRuntimeMessage({
    type: 'abrs/save-ledger-batch-files',
    payload: params,
  });
}

export function clearAbrsLedgerBatch(targetDate: string): Promise<AbrsLedgerBatch> {
  return sendRuntimeMessage({
    type: 'abrs/clear-ledger-batch',
    payload: { targetDate },
  });
}

export function downloadAllAbrsLedgerFiles(
  targetDate: string,
): Promise<DownloadAllAbrsLedgerFilesResult> {
  return sendRuntimeMessage({
    type: 'abrs/download-all-ledger-files',
    payload: { targetDate },
  });
}

export function downloadCachedAbrsLedgerFile(params: {
  targetDate: string;
  slot: AbrsLedgerPersistedEntry['slot'];
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
): Promise<AbrsLedgerSelectedTargetDate> {
  return sendRuntimeMessage({
    type: 'abrs/save-ledger-target-date',
    payload: { targetDate },
  });
}
