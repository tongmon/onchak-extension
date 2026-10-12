import assert from 'node:assert/strict';
import test from 'node:test';
import { ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS, downloadAbrsLedgerBatchWithProgress } from '../src/pages/abrs-automation/model/abrs-ledger-batch-progress.ts';
import type { AbrsLedgerBatch, AbrsCoupangLedgerDownloadSlot } from '../src/shared/extension/messaging/contracts.ts';
import { classifyAbrsLedgerFile } from '../src/pages/abrs-automation/model/abrs-ledger-files.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';
import { createFileFromAbrsCoupangDownload, getAbrsCoupangFileSourcePeriod } from '../src/pages/abrs-automation/api/abrs-coupang-download-file.ts';

const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' };
const originalBytes = createDailySettlementWorkbookBytes({});
const base64 = Buffer.from(originalBytes).toString('base64');
function initialBatch(): AbrsLedgerBatch { return { targetDate: period.periodEnd, ...period, updatedAt: null, entries: [] }; }
function collectedFiles(slot: AbrsCoupangLedgerDownloadSlot): File[] {
  const names: Partial<Record<AbrsCoupangLedgerDownloadSlot, string>> = {
    inventoryHealth: 'inventory_health_sku_info_20261011120000.xlsx',
    adPerformance: 'A000_pa_daily_vendorItem_20260901_20260930.xlsx',
    productList: 'price_inventory_261011.xlsx',
  };
  const fileNames = slot === 'salesStatistics'
    ? Array.from({ length: 30 }, (_, index) => `Statistics-202609${String(index + 1).padStart(2, '0')}~202609${String(index + 1).padStart(2, '0')}_(0).xlsx`)
    : names[slot] ? [names[slot]!]
    : ['01_20260906', '07_20260913', '14_20260920', '21_20260927', '28_20260930'].map((dates) => `A000-${slot}-202609${dates}.xlsx`);
  return fileNames.map((fileName) => createFileFromAbrsCoupangDownload({ fileName, mimeType: 'application/vnd.ms-excel', base64 }));
}
function persistedFiles(batch: AbrsLedgerBatch, files: File[], slot: AbrsCoupangLedgerDownloadSlot): AbrsLedgerBatch {
  const entries = files.map((file) => {
    const classification = classifyAbrsLedgerFile(file.name)!;
    assert.equal(classification.slot, slot);
    return { ...classification, dateRange: getAbrsCoupangFileSourcePeriod(file) ?? classification.dateRange,
      fileName: file.name, mimeType: file.type, base64, size: file.size, savedAt: '2026-10-11T00:00:00Z', collectionVersion: 2 };
  });
  return { ...batch, entries: [...batch.entries.filter((entry) => entry.slot !== slot), ...entries] };
}

test('downloads all thirteen sources with original period parameters and persists every file', async () => {
  let batch = initialBatch();
  const executed: string[] = [];
  const counts: number[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    targetDate: batch.targetDate, periodStart: '2026-09-01', periodEnd: '2026-09-30', initialBatch: batch,
    downloadSlot: async (request) => {
      executed.push(request.slot);
      assert.equal(request.periodStart, '2026-09-01');
      assert.equal(request.periodEnd, '2026-09-30');
      return collectedFiles(request.slot);
    },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
    onProgress: ({ completedCount }) => counts.push(completedCount),
  });
  assert.deepEqual(executed, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  assert.equal(result.batch.entries.length, 78);
  assert.equal(result.statuses.length, 13);
  assert.equal(counts.at(-1), 13);
  assert.ok(result.statuses.every((status) => status.status === 'downloaded'));
});

test('retries transient failures once, does not retry missing reports, and continues remaining sources', async () => {
  const attempts = new Map<string, number>();
  let batch = initialBatch();
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => {
      const count = (attempts.get(slot) ?? 0) + 1; attempts.set(slot, count);
      if (slot === 'inventoryHealth' && count === 1) throw new Error('network timeout');
      if (slot === 'PPIR') return [];
      return collectedFiles(slot);
    },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.equal(attempts.get('inventoryHealth'), 2);
  assert.equal(attempts.get('PPIR'), 1);
  assert.equal(attempts.size, 13);
  assert.equal(result.statuses.at(-1)?.status, 'failed');
  assert.match(result.statuses.at(-1)!.error!, /보고서가 없습니다/);
  assert.equal(batch.entries.length, 73);
});

function cachedBatch(slots: AbrsCoupangLedgerDownloadSlot[]): AbrsLedgerBatch {
  return slots.reduce((batch, slot) => persistedFiles(batch, collectedFiles(slot), slot), initialBatch());
}

test('resuming a partial collection keeps the three cached originals and downloads only missing sources', async () => {
  let batch = cachedBatch(['inventoryHealth', 'salesStatistics', 'adPerformance']);
  const originals = structuredClone(batch.entries);
  const executed: string[] = [];
  const counts: number[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { executed.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
    onProgress: ({ completedCount }) => counts.push(completedCount),
  });
  assert.deepEqual(executed, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS.slice(3));
  assert.deepEqual(result.batch.entries.slice(0, originals.length), originals);
  assert.deepEqual(counts.slice(0, 3), [1, 2, 3]);
  assert.equal(result.statuses.filter((status) => status.status === 'downloaded').length, 13);
  assert.equal(counts.at(-1), 13);
});

test('a fully cached period resumes without network calls or rewriting the originals', async () => {
  const batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async () => { assert.fail('A complete cached period must not be collected again'); },
    persistSlot: async () => { assert.fail('Original cache must be retained until a server receipt'); },
  });
  assert.equal(result.batch, batch);
  assert.equal(result.statuses.length, 13);
  assert.ok(result.statuses.every((status) => status.status === 'downloaded'));
});

test('a cache from a different requested period is never reused', async () => {
  let batch = cachedBatch(['inventoryHealth', 'salesStatistics']);
  const executed: string[] = [];
  await downloadAbrsLedgerBatchWithProgress({
    ...batch, periodStart: '2026-09-10', initialBatch: batch,
    downloadSlot: async ({ slot }) => { executed.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(executed, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
});

test('an incomplete ZIP or a Statistics original for different dates is collected again', async () => {
  let batch = cachedBatch(['inventoryHealth', 'salesStatistics']);
  batch.entries[0].base64 = Buffer.from('PK\x03\x04truncated').toString('base64');
  batch.entries[1].fileName = 'Statistics-20260901~20260928_(0).xlsx';
  batch.entries[1].dateRange = { start: '2026-09-01', end: '2026-09-28' };
  const executed: string[] = [];
  await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { executed.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(executed, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
});

test('a first settlement HTTP 403 stops all later Wing calls and preserves the four cached originals', async () => {
  const batch = cachedBatch(['inventoryHealth', 'salesStatistics', 'adPerformance', 'productList']);
  const originals = structuredClone(batch.entries);
  const requested: string[] = [];
  const counts: number[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { requested.push(slot); throw new Error('쿠팡이 요청을 거부했습니다(HTTP 403).'); },
    persistSlot: async () => { assert.fail('A denied request must not overwrite any original'); },
    onProgress: ({ completedCount }) => counts.push(completedCount),
  });
  assert.deepEqual(requested, ['CATEGORY_TR']);
  assert.deepEqual(result.batch.entries, originals);
  assert.equal(result.statuses.length, 13);
  assert.equal(result.statuses.filter((status) => status.status === 'downloaded').length, 4);
  assert.match(result.statuses.find((status) => status.slot === 'CATEGORY_TR')!.error!, /HTTP 403/);
  for (const status of result.statuses.slice(5)) {
    assert.equal(status.status, 'failed');
    assert.match(status.error!, /Wing.*접근 거부.*요청하지 않았습니다/);
  }
  assert.equal(counts.at(-1), 4);
});

test('Wing denial still allows independent Ads collection and reuses later cached Wing files', async () => {
  let batch = cachedBatch(['salesStatistics', 'productList']);
  const originals = structuredClone(batch.entries);
  const requested: string[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => {
      requested.push(slot);
      if (slot === 'inventoryHealth') throw new Error('Coupang 파일 다운로드 실패: 403');
      assert.equal(slot, 'adPerformance');
      return collectedFiles('adPerformance');
    },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(requested, ['inventoryHealth', 'adPerformance']);
  assert.deepEqual(result.batch.entries.slice(0, originals.length), originals);
  assert.equal(result.statuses.find((status) => status.slot === 'salesStatistics')!.status, 'downloaded');
  assert.equal(result.statuses.find((status) => status.slot === 'productList')!.status, 'downloaded');
  assert.equal(result.statuses.find((status) => status.slot === 'adPerformance')!.status, 'downloaded');
  assert.equal(result.statuses.filter((status) => status.status === 'failed').length, 10);
});

test('an Ads access denial is not retried and does not stop remaining Wing downloads', async () => {
  let batch = initialBatch();
  const requested: string[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => {
      requested.push(slot);
      if (slot === 'adPerformance') throw new Error('쿠팡이 요청을 거부했습니다(HTTP 403).');
      return collectedFiles(slot);
    },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(requested, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  assert.equal(result.statuses.find((status) => status.slot === 'adPerformance')!.status, 'failed');
  assert.equal(result.statuses.filter((status) => status.status === 'downloaded').length, 12);
});

test('HTTP 401, login HTML and explicit access denial stop the site after one attempt', async () => {
  for (const message of [
    '쿠팡이 요청을 거부했습니다(HTTP 401).',
    '판매 현황 Excel 상태 확인 실패: 403',
    '상품 리스트 Excel 요청 확인 실패: 401',
    '상품 리스트 Excel 상태 확인 실패: 403',
    '쿠팡 로그인 또는 접근 제한 화면을 받았습니다. 해당 탭에서 로그인 상태를 확인해주세요.',
    '원본 Excel 대신 인증/오류 응답을 받았습니다.',
    'Access Denied',
  ]) {
    let batch = initialBatch();
    const requested: string[] = [];
    const result = await downloadAbrsLedgerBatchWithProgress({
      ...batch, initialBatch: batch,
      downloadSlot: async ({ slot }) => {
        requested.push(slot);
        if (slot === 'inventoryHealth') throw new Error(message);
        assert.equal(slot, 'adPerformance');
        return collectedFiles('adPerformance');
      },
      persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
    });
    assert.deepEqual(requested, ['inventoryHealth', 'adPerformance']);
    assert.equal(result.statuses[0].error, message);
    assert.match(result.statuses[1].error!, /Wing.*요청하지 않았습니다/);
    assert.equal(result.statuses.filter((status) => status.status === 'failed').length, 12);
  }
});

test('HTTP 500 and exhausted timeouts retain two attempts and allow later sources from the same site', async () => {
  for (const message of ['쿠팡 보고서 요청 실패(HTTP 500)', '재고 현황 원본 다운로드 시간이 60초를 초과했습니다.']) {
    let batch = initialBatch();
    const attempts = new Map<string, number>();
    const result = await downloadAbrsLedgerBatchWithProgress({
      ...batch, initialBatch: batch,
      downloadSlot: async ({ slot }) => {
        attempts.set(slot, (attempts.get(slot) ?? 0) + 1);
        if (slot === 'inventoryHealth') throw new Error(message);
        return collectedFiles(slot);
      },
      persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
    });
    assert.equal(attempts.get('inventoryHealth'), 2);
    assert.equal(attempts.size, 13);
    assert.equal(attempts.get('salesStatistics'), 1);
    assert.equal(attempts.get('PPIR'), 1);
    assert.equal(result.statuses.filter((status) => status.status === 'downloaded').length, 12);
  }
});

test('daily collection requests only four sources and persists a single-day Statistics original', async () => {
  let batch: AbrsLedgerBatch = { targetDate: period.periodEnd, updatedAt: null, entries: [] };
  const requested: string[] = [];
  const totals: number[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    targetDate: batch.targetDate, initialBatch: batch,
    downloadSlot: async ({ slot }) => {
      requested.push(slot);
      if (slot === 'salesStatistics') return collectedFiles(slot).slice(-1);
      if (slot === 'adPerformance') return [createFileFromAbrsCoupangDownload({
        fileName: 'A000_pa_daily_vendorItem_20260930_20260930.xlsx', mimeType: 'application/vnd.ms-excel', base64,
      })];
      return collectedFiles(slot);
    },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
    onProgress: ({ totalCount }) => totals.push(totalCount),
  });
  assert.deepEqual(requested, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS.slice(0, 4));
  assert.equal(result.statuses.length, 4);
  assert.equal(result.batch.entries.length, 4);
  assert.ok(result.statuses.every((status) => status.status === 'downloaded'));
  assert.ok(totals.every((count) => count === 4));
  assert.deepEqual(result.batch.entries.find((entry) => entry.slot === 'salesStatistics')?.dateRange,
    { start: '2026-09-30', end: '2026-09-30' });
});

test('a monthly cache missing one daily Statistics original recollects that entire source only', async () => {
  let batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  batch.entries = batch.entries.filter((entry) => entry.fileName !== 'Statistics-20260915~20260915_(0).xlsx');
  const requested: string[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { requested.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(requested, ['salesStatistics']);
  assert.equal(result.batch.entries.filter((entry) => entry.slot === 'salesStatistics').length, 30);
  assert.ok(result.statuses.every((status) => status.status === 'downloaded'));
});

test('a single monthly Statistics aggregate cannot substitute for the thirty daily originals', async () => {
  let batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  const aggregate = createFileFromAbrsCoupangDownload({
    fileName: 'Statistics-20260901~20260930_(0).xlsx', mimeType: 'application/vnd.ms-excel', base64,
  });
  batch = persistedFiles(batch, [aggregate], 'salesStatistics');
  const requested: string[] = [];
  await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { requested.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(requested, ['salesStatistics']);
});

test('legacy cached originals without a verified collection version are collected again', async () => {
  let batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  for (const entry of batch.entries) delete entry.collectionVersion;
  const requested: string[] = [];
  await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { requested.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(requested, ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
});

test('ambiguous duplicate source filenames cannot silently overwrite an original chunk', async () => {
  const batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  batch.entries.filter((entry) => entry.slot === 'salesStatistics').forEach((entry) => { delete entry.collectionVersion; });
  const originals = structuredClone(batch.entries);
  let saves = 0;
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch, maxAttempts: 1,
    downloadSlot: async () => [collectedFiles('salesStatistics')[0], collectedFiles('salesStatistics')[0]],
    persistFiles: async () => { saves++; throw new Error('must not persist ambiguous originals'); },
  });
  assert.equal(saves, 0);
  assert.equal(result.statuses.find((status) => status.slot === 'salesStatistics')?.status, 'failed');
  assert.match(result.statuses.find((status) => status.slot === 'salesStatistics')!.error!, /파일명이 중복/);
  assert.deepEqual(result.batch.entries, originals);
});

test('a failed atomic multi-file save retains every previous source original and never falls back to partial saves', async () => {
  const batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  batch.entries.filter((entry) => entry.slot === 'salesStatistics').forEach((entry) => { delete entry.collectionVersion; });
  const originals = structuredClone(batch.entries);
  let saves = 0;
  const requested: string[] = [];
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { requested.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => {
      saves += 1;
      assert.equal(slot, 'salesStatistics');
      assert.equal(files.length, 30);
      throw new Error('storage write failed');
    },
    persistSlot: async () => { assert.fail('A source set must never be saved one file at a time'); },
  });
  assert.equal(saves, 2);
  assert.deepEqual(requested, ['salesStatistics', 'salesStatistics']);
  assert.equal(result.batch, batch);
  assert.deepEqual(result.batch.entries, originals);
  assert.equal(result.statuses.find((status) => status.slot === 'salesStatistics')?.status, 'failed');
  assert.equal(result.statuses.filter((status) => status.status === 'downloaded').length, 12);
});

test('multi-file collection requires an atomic persistence callback', async () => {
  const batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS.filter((slot) => slot !== 'salesStatistics'));
  const result = await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch, maxAttempts: 1,
    downloadSlot: async () => collectedFiles('salesStatistics'),
    persistSlot: async () => { assert.fail('Partial persistence must be refused'); },
  });
  assert.equal(result.batch, batch);
  const failed = result.statuses.filter((status) => status.status === 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].slot, 'salesStatistics');
  assert.match(failed[0].error!, /한 세트/);
});

test('cached filename dates cannot be replaced by conflicting cached date metadata', async () => {
  let batch = cachedBatch(ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS);
  const firstDay = batch.entries.find((entry) => entry.fileName === 'Statistics-20260901~20260901_(0).xlsx')!;
  // An old aggregate was incorrectly marked as one day; all thirty metadata dates still appear covered.
  firstDay.fileName = 'Statistics-20260901~20260930_(0).xlsx';
  const requested: string[] = [];
  await downloadAbrsLedgerBatchWithProgress({
    ...batch, initialBatch: batch,
    downloadSlot: async ({ slot }) => { requested.push(slot); return collectedFiles(slot); },
    persistFiles: async (files, slot) => { batch = persistedFiles(batch, files, slot); return batch; },
  });
  assert.deepEqual(requested, ['salesStatistics']);
});
