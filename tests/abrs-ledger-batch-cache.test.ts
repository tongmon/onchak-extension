import assert from 'node:assert/strict';
import test from 'node:test';
import {
  persistAbrsLedgerFiles,
  restoreAbrsLedgerEntries,
  upsertAbrsLedgerPersistedDownloads,
} from '../src/pages/abrs-automation/model/abrs-ledger-batch-cache.ts';

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

test('persistAbrsLedgerFiles replaces duplicate slots instead of duplicating them', async () => {
  const targetDate = '2026-04-18';
  const existingEntries = await persistAbrsLedgerFiles({
    existingEntries: [],
    files: [workbook('Statistics-20260418~20260418_(0).xlsx', 'old')],
    targetDate,
    savedAt: '2026-07-09T00:00:00.000Z',
  });
  const replacedEntries = await persistAbrsLedgerFiles({
    existingEntries,
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
