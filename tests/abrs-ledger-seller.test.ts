import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAbrsLedgerSellerId, stampAbrsCoupangDownloads } from '../src/pages/abrs-automation/model/abrs-ledger-seller.ts';
import { createFileFromAbrsCoupangDownload, getAbrsCoupangFileSellerId } from '../src/pages/abrs-automation/api/abrs-coupang-download-file.ts';
import { persistAbrsLedgerFiles, restoreAbrsLedgerEntries, createAbrsLedgerOriginalSignatures, retainUnacknowledgedAbrsLedgerEntries } from '../src/pages/abrs-automation/model/abrs-ledger-batch-cache.ts';
import { downloadAbrsLedgerBatchWithProgress } from '../src/pages/abrs-automation/model/abrs-ledger-batch-progress.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';
import { buildAbrsLedgerPeriodFormData } from '../src/pages/abrs-automation/api/abrs-ledger-import-request.ts';

const sellerA = 'A12345678', sellerB = 'A87654321';
const base64 = Buffer.from(createDailySettlementWorkbookBytes({})).toString('base64');
const fileName = 'Statistics-20260901~20260901_(0).xlsx';
const original = (sellerId: string) => createFileFromAbrsCoupangDownload({ fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64, sellerId });

test('unknown originals do not claim seller verification and known hints must agree', () => {
  assert.equal(resolveAbrsLedgerSellerId([{ fileName }]), undefined);
  assert.equal(resolveAbrsLedgerSellerId([{ fileName: `${sellerA}-CATEGORY_TR.xlsx` }]), sellerA);
  assert.throws(() => resolveAbrsLedgerSellerId([{ fileName: `${sellerA}-CATEGORY_TR.xlsx` }], sellerB), /판매자/);
  assert.throws(() => resolveAbrsLedgerSellerId([{ fileName: `${sellerA}-CATEGORY_TR.xlsx`, sellerId: sellerB }]), /판매자/);
  assert.throws(() => resolveAbrsLedgerSellerId([], 'invalid'), /판매자/);
});

test('Wing session must stay unchanged and Ads originals must identify the same seller', () => {
  assert.deepEqual(stampAbrsCoupangDownloads([{ fileName }], sellerA, sellerA, sellerA, true), [{ fileName, sellerId: sellerA }]);
  assert.throws(() => stampAbrsCoupangDownloads([{ fileName }], sellerA, sellerA, sellerB, true), /변경/);
  assert.throws(() => stampAbrsCoupangDownloads([{ fileName }], sellerA, sellerA, undefined, true), /확인/);
  assert.throws(() => stampAbrsCoupangDownloads([{ fileName: `${sellerB}_pa_daily_vendorItem.xlsx` }], sellerA, undefined, undefined, false), /판매자/);
  assert.throws(() => stampAbrsCoupangDownloads([{ fileName: 'report.xlsx' }], sellerA, undefined, undefined, false), /확인/);
  assert.equal(stampAbrsCoupangDownloads([{ fileName: `${sellerA}_pa_daily_vendorItem.xlsx` }], sellerA, undefined, undefined, false)[0].sellerId, sellerA);
});

test('seller provenance survives cache restore and is sent as an expected seller constraint', async () => {
  const entries = await persistAbrsLedgerFiles({ existingEntries: [], files: [original(sellerA)], targetDate: '2026-09-01', replaceSlots: ['salesStatistics'] });
  assert.equal(entries[0].sellerId, sellerA);
  const restored = restoreAbrsLedgerEntries(entries);
  assert.equal(restored[0].sellerId, sellerA);
  assert.equal(getAbrsCoupangFileSellerId(restored[0].file), sellerA);
  const data = buildAbrsLedgerPeriodFormData({ targetDate: '2026-09-01', batchName: 'test', entries: restored,
    period: { start: '2026-09-01', end: '2026-09-01' }, uploadMode: 'daily', selectedSellerId: sellerA });
  assert.equal(data.get('selectedSellerId'), sellerA);
});

test('cross-seller replacement is rejected before deleting an old unnamed Statistics original', async () => {
  const entries = await persistAbrsLedgerFiles({ existingEntries: [], files: [original(sellerA)], targetDate: '2026-09-01' });
  await assert.rejects(persistAbrsLedgerFiles({ existingEntries: entries, files: [original(sellerB)], targetDate: '2026-09-01', replaceSlots: ['salesStatistics'] }), /판매자/);
  assert.equal(entries[0].sellerId, sellerA);
});

test('a late receipt cannot clear identical unnamed bytes collected under a different seller', async () => {
  const first = await persistAbrsLedgerFiles({ existingEntries: [], files: [original(sellerA)], targetDate: '2026-09-01' });
  const second = await persistAbrsLedgerFiles({ existingEntries: [], files: [original(sellerB)], targetDate: '2026-09-01' });
  const signatures = await createAbrsLedgerOriginalSignatures(restoreAbrsLedgerEntries(first));
  assert.equal((await retainUnacknowledgedAbrsLedgerEntries(second, signatures)).length, 1);
});

test('automatic collection refuses another seller cache before requesting any file', async () => {
  const entries = await persistAbrsLedgerFiles({ existingEntries: [], files: [original(sellerA)], targetDate: '2026-09-01' });
  let requests = 0;
  await assert.rejects(downloadAbrsLedgerBatchWithProgress({ targetDate: '2026-09-01', initialBatch: { targetDate: '2026-09-01', entries, updatedAt: null }, expectedSellerId: sellerB,
    downloadSlot: async () => { requests++; return []; } }), /판매자/);
  assert.equal(requests, 0);
});

test('legacy automatic cache with no seller provenance is recollected rather than reused', async () => {
  const entries = await persistAbrsLedgerFiles({ existingEntries: [], files: [new File([createDailySettlementWorkbookBytes({})], fileName)], targetDate: '2026-09-01', replaceSlots: ['salesStatistics'] });
  const requested: string[] = [];
  await downloadAbrsLedgerBatchWithProgress({ targetDate: '2026-09-01', initialBatch: { targetDate: '2026-09-01', entries, updatedAt: null }, expectedSellerId: sellerA,
    downloadSlot: async ({ slot }) => { requested.push(slot); return []; } });
  assert.ok(requested.includes('salesStatistics'));
});
