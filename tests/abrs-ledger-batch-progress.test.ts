import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS,
  downloadAbrsLedgerBatchWithProgress,
} from '../src/pages/abrs-automation/model/abrs-ledger-batch-progress.ts';
import type { AbrsLedgerBatch } from '../src/shared/extension/messaging/contracts.ts';

test('batch download executes four slots and persists intermediate progress', async () => {
  const executedSlots: string[] = [];
  const persistedCounts: number[] = [];
  const progressCounts: string[] = [];
  let batch: AbrsLedgerBatch = {
    targetDate: '2026-04-18',
    updatedAt: null,
    entries: [],
  };

  const result = await downloadAbrsLedgerBatchWithProgress({
    targetDate: batch.targetDate,
    initialBatch: batch,
    downloadSlot: async ({ slot }) => {
      executedSlots.push(slot);
      return new File(['xlsx'], `${slot}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    },
    persistSlot: async (_file, slot) => {
      batch = {
        ...batch,
        entries: [
          ...batch.entries,
          {
            slot,
            sourceType: 'COUPANG_SALES_STATISTICS',
            label: slot,
            dateRange: null,
            fileName: `${slot}.xlsx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            base64: 'eGxzeA==',
            size: 4,
            savedAt: '2026-04-18T00:00:00.000Z',
          },
        ],
      };
      persistedCounts.push(batch.entries.length);
      return batch;
    },
    onProgress: ({ completedCount, totalCount }) => {
      progressCounts.push(`${completedCount}/${totalCount}`);
    },
  });

  assert.deepEqual(executedSlots, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  assert.deepEqual(persistedCounts, [1, 2, 3, 4]);
  assert.deepEqual(progressCounts, ['1/4', '2/4', '3/4', '4/4']);
  assert.equal(result.batch.entries.length, 4);
  assert.equal(result.statuses.length, 4);
  assert.ok(result.statuses.every((status) => status.status === 'downloaded'));
});
