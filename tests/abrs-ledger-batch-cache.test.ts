import assert from 'node:assert/strict';
import test from 'node:test';
import {
  persistAbrsLedgerFiles,
  restoreAbrsLedgerEntries,
  upsertAbrsLedgerPersistedDownloads,
  createAbrsLedgerOriginalSignatures,
  retainUnacknowledgedAbrsLedgerEntries,
} from '../src/pages/abrs-automation/model/abrs-ledger-batch-cache.ts';
import { serializeAbrsLedgerBatchOperation } from '../src/pages/abrs-automation/model/abrs-ledger-batch-store.ts';
import { createFileFromAbrsCoupangDownload, getAbrsCoupangFileSourcePeriod } from '../src/pages/abrs-automation/api/abrs-coupang-download-file.ts';

const xlsxMimeType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function workbook(name: string, content = 'xlsx'): File {
  return new File([content], name, {
    type: xlsxMimeType,
    lastModified: 1_780_000_000_000,
  });
}

test('persistAbrsLedgerFiles keeps one-by-one files stacked across slots', async () => {
  const targetDate = '2026-04-18';
  const afterInventory = await persistAbrsLedgerFiles({
    existingEntries: [],
    files: [workbook('inventory_health_sku_info_20260616220816.xlsx')],
    targetDate,
    savedAt: '2026-07-09T00:00:00.000Z',
  });
  const afterSales = await persistAbrsLedgerFiles({
    existingEntries: afterInventory,
    files: [workbook('Statistics-20260418~20260418_(0).xlsx')],
    targetDate,
    savedAt: '2026-07-09T00:01:00.000Z',
  });
  const afterSettlement = await persistAbrsLedgerFiles({
    existingEntries: afterSales,
    files: [workbook('A01549099-dailySettlement-20260418-20260418.xlsx')],
    targetDate,
    savedAt: '2026-07-09T00:02:00.000Z',
  });

  assert.deepEqual(
    afterSettlement.map((entry) => entry.slot),
    ['inventoryHealth', 'salesStatistics', 'dailySettlement'],
  );
  assert.deepEqual(
    afterSettlement.map((entry) => entry.fileName),
    [
      'inventory_health_sku_info_20260616220816.xlsx',
      'Statistics-20260418~20260418_(0).xlsx',
      'A01549099-dailySettlement-20260418-20260418.xlsx',
    ],
  );
});

test('persistAbrsLedgerFiles explicitly replaces a Statistics collection instead of retaining old parts', async () => {
  const targetDate = '2026-04-18';
  const existingEntries = await persistAbrsLedgerFiles({
    existingEntries: [],
    files: [workbook('Statistics-20260418~20260418_(0).xlsx', 'old')],
    targetDate,
    savedAt: '2026-07-09T00:00:00.000Z',
  });
  const replacedEntries = await persistAbrsLedgerFiles({
    existingEntries,
    replaceSlots: ['salesStatistics'],
    files: [workbook('Statistics-20260418~20260418_(1).xlsx', 'new')],
    targetDate,
    savedAt: '2026-07-09T00:01:00.000Z',
  });

  assert.equal(replacedEntries.length, 1);
  assert.equal(
    replacedEntries[0]?.fileName,
    'Statistics-20260418~20260418_(1).xlsx',
  );
  assert.equal(replacedEntries[0]?.base64, btoa('new'));
});

test('restoreAbrsLedgerEntries restores uploadable File entries from persisted cache', async () => {
  const targetDate = '2026-04-18';
  const persistedEntries = await persistAbrsLedgerFiles({
    existingEntries: [],
    files: [workbook('A01549099-dailySettlement-20260418-20260418.xlsx')],
    targetDate,
    savedAt: '2026-07-09T00:00:00.000Z',
  });

  const restoredEntries = restoreAbrsLedgerEntries(persistedEntries);

  assert.equal(restoredEntries.length, 1);
  assert.equal(restoredEntries[0]?.slot, 'dailySettlement');
  assert.equal(
    restoredEntries[0]?.file.name,
    'A01549099-dailySettlement-20260418-20260418.xlsx',
  );
  assert.equal(await restoredEntries[0]?.file.text(), 'xlsx');
});

test('upsertAbrsLedgerPersistedDownloads stores background download payloads by slot', () => {
  const entries = upsertAbrsLedgerPersistedDownloads({
    existingEntries: [],
    downloads: [
      {
        slot: 'inventoryHealth',
        fileName: 'inventory_health_sku_info_20260706223816.xlsx',
        mimeType: xlsxMimeType,
        base64: btoa('inventory'),
      },
      {
        slot: 'salesStatistics',
        fileName: 'Statistics-20260418~20260418_(0).xlsx',
        mimeType: xlsxMimeType,
        base64: btoa('sales'),
      },
    ],
    savedAt: '2026-07-09T00:00:00.000Z',
  });

  assert.deepEqual(
    entries.map((entry) => [entry.slot, entry.fileName]),
    [
      ['inventoryHealth', 'inventory_health_sku_info_20260706223816.xlsx'],
      ['salesStatistics', 'Statistics-20260418~20260418_(0).xlsx'],
    ],
  );
});

test('settlement cache preserves different statement originals and replaces only identical filenames', async () => {
  const first = 'A01549099-CATEGORY_TR-20260901_20260915.xlsx';
  const second = 'A01549099-CATEGORY_TR-20260916_20260930.xlsx';
  const entries = await persistAbrsLedgerFiles({ existingEntries: [], targetDate: '2026-09-30',
    files: [workbook(first, 'first'), workbook(second, 'second'), workbook(first, 'updated')] });
  assert.equal(entries.length, 2);
  const restored = restoreAbrsLedgerEntries(entries);
  assert.equal(await restored[0]!.file.text(), 'updated');
  assert.equal(await restored[1]!.file.text(), 'second');
  assert.equal(restored[0]!.dateRange?.end, '2026-09-15');
  assert.equal(restored[1]!.dateRange?.start, '2026-09-16');
});

test('explicit successful re-collection replaces only the requested settlement kind', async () => {
  const targetDate = '2026-09-30';
  const existingEntries = await persistAbrsLedgerFiles({
    existingEntries: [], targetDate,
    files: [workbook('A01549099-CATEGORY_TR-ko-old.xlsx', 'old'),
      workbook('A01549099-STORAGE_FEE-ko-keep.xlsx', 'keep')],
  });
  const result = await persistAbrsLedgerFiles({
    existingEntries, targetDate, replaceSlots: ['CATEGORY_TR'],
    files: [workbook('A01549099-CATEGORY_TR-ko-new.xlsx', 'new')],
  });
  assert.equal(result.length, 2);
  assert.equal(result.find((entry) => entry.slot === 'CATEGORY_TR')?.fileName,
    'A01549099-CATEGORY_TR-ko-new.xlsx');
  assert.equal(result.find((entry) => entry.slot === 'CATEGORY_TR')?.base64, btoa('new'));
  assert.deepEqual(result.find((entry) => entry.slot === 'STORAGE_FEE'), existingEntries[1]);
  await assert.rejects(persistAbrsLedgerFiles({
    existingEntries, targetDate, replaceSlots: ['CATEGORY_TR'], files: [],
  }), /새 원본이 없는/);
  assert.equal(existingEntries[0]?.base64, btoa('old'));
});

test('settlement weekly provenance survives background cache, File restore and repersistence', async () => {
  const sourcePeriods = [{ start: '2026-09-01', end: '2026-09-06' }, { start: '2026-09-07', end: '2026-09-13' }];
  const downloads = sourcePeriods.map((sourcePeriod, index) => ({
    slot: 'CATEGORY_TR' as const, fileName: `A000-CATEGORY_TR-ko-original-${index}.xlsx`,
    mimeType: xlsxMimeType, base64: btoa(`week-${index}`), sourcePeriod,
  }));
  const stored = upsertAbrsLedgerPersistedDownloads({ existingEntries: [], downloads });
  assert.deepEqual(stored.map((entry) => entry.dateRange), sourcePeriods);
  assert.ok(stored.every((entry) => entry.collectionVersion === 2));
  const restored = restoreAbrsLedgerEntries(stored);
  assert.deepEqual(restored.map((entry) => entry.dateRange), sourcePeriods);
  assert.deepEqual(restored.map((entry) => getAbrsCoupangFileSourcePeriod(entry.file)), sourcePeriods);
  assert.equal(await restored[1].file.text(), 'week-1');
  const repersisted = await persistAbrsLedgerFiles({ existingEntries: [], files: restored.map((entry) => entry.file),
    targetDate: '2026-09-30', replaceSlots: ['CATEGORY_TR'] });
  assert.deepEqual(repersisted.map((entry) => entry.dateRange), sourcePeriods);
  assert.ok(repersisted.every((entry) => entry.collectionVersion === 2));
});

test('manual files keep no automatic collection version and unsafe cached provenance is rejected', async () => {
  const file = createFileFromAbrsCoupangDownload({ fileName: 'A000-CATEGORY_TR-ko-original.xlsx', mimeType: xlsxMimeType,
    base64: btoa('week'), sourcePeriod: { start: '2026-09-07', end: '2026-09-13' } });
  const stored = await persistAbrsLedgerFiles({ existingEntries: [], files: [file], targetDate: '2026-09-30' });
  assert.equal(stored[0].collectionVersion, undefined);
  assert.deepEqual(stored[0].dateRange, { start: '2026-09-07', end: '2026-09-13' });
  assert.throws(() => restoreAbrsLedgerEntries([{ ...stored[0], dateRange: { start: '2026-02-30', end: '2026-03-01' } }]), /조회 기간 정보/);
  assert.throws(() => restoreAbrsLedgerEntries([{ ...stored[0], fileName: 'A000-CATEGORY_TR-20260901_20260906.xlsx' }]), /파일명과 조회 기간/);
});

test('late receipt removes only uploaded originals and retains changed bytes, new names and new shards', async () => {
  const targetDate = '2026-04-18';
  const uploaded = await persistAbrsLedgerFiles({ existingEntries: [], targetDate, files: [
    workbook('Statistics-20260418~20260418_(0).xlsx', 'old-sales'),
    workbook('inventory_health_sku_info_20261011120000.xlsx', 'inventory'),
    workbook('price_inventory_261011.xlsx', 'product'),
  ] });
  const expected = await createAbrsLedgerOriginalSignatures(restoreAbrsLedgerEntries(uploaded));
  assert.ok(expected.every((signature) => /^[a-f0-9]{64}$/.test(signature.contentSha256)));
  assert.equal(JSON.stringify(expected).includes('base64'), false);
  const latest = await persistAbrsLedgerFiles({ existingEntries: uploaded, targetDate, files: [
    workbook('Statistics-20260418~20260418_(0).xlsx', 'new-sales'),
    workbook('Statistics-20260418~20260418_(1).xlsx', 'another-shard'),
    workbook('inventory_health_sku_info_20261012120000.xlsx', 'inventory'),
  ] });
  const retained = await retainUnacknowledgedAbrsLedgerEntries(latest, expected);
  assert.deepEqual(retained.map((entry) => entry.fileName), [
    'Statistics-20260418~20260418_(0).xlsx', 'inventory_health_sku_info_20261012120000.xlsx',
    'Statistics-20260418~20260418_(1).xlsx',
  ]);
  assert.equal(retained[0].base64, btoa('new-sales'));
});

test('receipt signatures canonicalize Chrome copies while preserving shard and source-period identity', async () => {
  const targetDate = '2026-09-30';
  const file = createFileFromAbrsCoupangDownload({ fileName: 'A000-CATEGORY_TR-ko-source.xlsx', mimeType: xlsxMimeType,
    base64: btoa('original'), sourcePeriod: { start: '2026-09-01', end: '2026-09-06' } });
  const original = await persistAbrsLedgerFiles({ existingEntries: [], targetDate, files: [file] });
  const expected = await createAbrsLedgerOriginalSignatures(restoreAbrsLedgerEntries(original));
  assert.deepEqual(await retainUnacknowledgedAbrsLedgerEntries([
    { ...original[0], fileName: 'A000-CATEGORY_TR-ko-source (1).xlsx' },
  ], expected), []);
  const changedPeriod = { ...original[0], dateRange: { start: '2026-09-07', end: '2026-09-13' } };
  assert.deepEqual(await retainUnacknowledgedAbrsLedgerEntries([changedPeriod], expected), [changedPeriod]);
  assert.deepEqual(await retainUnacknowledgedAbrsLedgerEntries(original, []), original);
  await assert.rejects(retainUnacknowledgedAbrsLedgerEntries(original, [{ ...expected[0], contentSha256: 'invalid' }]), /삭제 확인 정보/);
});

test('batch queue serializes same-batch read-modify-write work, recovers after failure and allows independent batches', async () => {
  let releaseFirst!: () => void;
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const events: string[] = [];
  const first = serializeAbrsLedgerBatchOperation('same', async () => { events.push('first-start'); await gate; events.push('first-end'); });
  const second = serializeAbrsLedgerBatchOperation('same', async () => { events.push('second'); throw new Error('expected failure'); });
  const secondObserved = assert.rejects(second, /expected failure/);
  const third = serializeAbrsLedgerBatchOperation('same', async () => { events.push('third'); });
  await serializeAbrsLedgerBatchOperation('other', async () => { events.push('other'); });
  assert.deepEqual(events, ['first-start', 'other']);
  releaseFirst();
  await Promise.all([first, secondObserved, third]);
  assert.deepEqual(events, ['first-start', 'other', 'first-end', 'second', 'third']);
});
