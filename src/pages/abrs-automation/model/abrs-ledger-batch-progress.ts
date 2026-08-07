import type {
  AbrsCoupangLedgerDownloadSlot,
  AbrsLedgerBatch,
  AbrsLedgerDownloadSlotStatus,
} from '../../../shared/extension/messaging/contracts.ts';

export const ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS: AbrsCoupangLedgerDownloadSlot[] = [
  'inventoryHealth',
  'salesStatistics',
  'dailySettlement',
  'productList',
];

export interface AbrsLedgerBatchProgress {
  batch: AbrsLedgerBatch;
  completedCount: number;
  totalCount: number;
  status: AbrsLedgerDownloadSlotStatus;
}

export interface AbrsLedgerBatchDownloadResult {
  batch: AbrsLedgerBatch;
  statuses: AbrsLedgerDownloadSlotStatus[];
}

interface DownloadAbrsLedgerBatchWithProgressInput {
  targetDate: string;
  initialBatch: AbrsLedgerBatch;
  downloadSlot: (params: {
    slot: AbrsCoupangLedgerDownloadSlot;
    targetDate: string;
  }) => Promise<File>;
  persistSlot: (
    file: File,
    slot: AbrsCoupangLedgerDownloadSlot,
  ) => Promise<AbrsLedgerBatch>;
  onProgress?: (progress: AbrsLedgerBatchProgress) => void;
}

function completedRequiredSlotCount(batch: AbrsLedgerBatch): number {
  const storedSlots = new Set(batch.entries.map((entry) => entry.slot));
  return ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS.filter((slot) => storedSlots.has(slot)).length;
}

export async function downloadAbrsLedgerBatchWithProgress({
  targetDate,
  initialBatch,
  downloadSlot,
  persistSlot,
  onProgress,
}: DownloadAbrsLedgerBatchWithProgressInput): Promise<AbrsLedgerBatchDownloadResult> {
  let batch = initialBatch;
  const statuses: AbrsLedgerDownloadSlotStatus[] = [];

  for (const slot of ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS) {
    let status: AbrsLedgerDownloadSlotStatus;

    try {
      const file = await downloadSlot({ slot, targetDate });
      batch = await persistSlot(file, slot);
      status = {
        slot,
        status: 'downloaded',
        fileName: file.name,
      };
    } catch (error) {
      status = {
        slot,
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'Coupang 파일을 가져오지 못했습니다.',
      };
    }

    statuses.push(status);
    onProgress?.({
      batch,
      completedCount: completedRequiredSlotCount(batch),
      totalCount: ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS.length,
      status,
    });
  }

  return { batch, statuses };
}
