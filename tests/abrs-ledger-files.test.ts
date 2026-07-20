import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyAbrsLedgerFile,
  createAbrsLedgerBatchName,
  upsertAbrsLedgerFiles,
  validateAbrsLedgerFiles,
} from '../src/pages/abrs-automation/model/abrs-ledger-files.ts';

function file(name: string): File {
  return { name } as File;
}

test('classifyAbrsLedgerFile maps Coupang sales statistics with an authoritative date range', () => {
  const classified = classifyAbrsLedgerFile(
    'Statistics-20260418~20260418_(0).xlsx',
  );

  assert.deepEqual(classified, {
    slot: 'salesStatistics',
    sourceType: 'COUPANG_SALES_STATISTICS',
    label: '판매 현황',
    dateRange: {
      start: '2026-04-18',
      end: '2026-04-18',
    },
  });
});

test('classifyAbrsLedgerFile maps Coupang daily settlement with an authoritative date range', () => {
  const classified = classifyAbrsLedgerFile(
    'A01549099-dailySettlement-20260418-20260418.xlsx',
  );

  assert.deepEqual(classified, {
    slot: 'dailySettlement',
    sourceType: 'COUPANG_DAILY_SETTLEMENT',
    label: '광고비/정산',
    dateRange: {
      start: '2026-04-18',
      end: '2026-04-18',
    },
  });
});

test('classifyAbrsLedgerFile maps inventory health without using its timestamp as a target date', () => {
  const classified = classifyAbrsLedgerFile(
    'inventory_health_sku_info_20260616220816.xlsx',
  );

  assert.deepEqual(classified, {
    slot: 'inventoryHealth',
    sourceType: 'COUPANG_INVENTORY_HEALTH',
    label: '재고 현황',
    dateRange: null,
  });
});

test('classifyAbrsLedgerFile maps optional Coupang product list files', () => {
  const classified = classifyAbrsLedgerFile('price_inventory_260717.xlsx');

  assert.deepEqual(classified, {
    slot: 'productList',
    sourceType: 'COUPANG_PRICE_INVENTORY',
    label: '상품 리스트',
    dateRange: null,
  });
});

test('upsertAbrsLedgerFiles keeps files stacked when they are added one by one', () => {
  const targetDate = '2026-04-18';
  const afterInventory = upsertAbrsLedgerFiles(
    [],
    [file('inventory_health_sku_info_20260616220816.xlsx')],
    targetDate,
  );
  const afterSales = upsertAbrsLedgerFiles(
    afterInventory,
    [file('Statistics-20260418~20260418_(0).xlsx')],
    targetDate,
  );
  const afterSettlement = upsertAbrsLedgerFiles(
    afterSales,
    [file('A01549099-dailySettlement-20260418-20260418.xlsx')],
    targetDate,
  );

  assert.deepEqual(
    afterSettlement.map((entry) => entry.slot),
    ['inventoryHealth', 'salesStatistics', 'dailySettlement'],
  );
});

test('upsertAbrsLedgerFiles replaces a duplicate slot instead of adding ambiguous duplicates', () => {
  const targetDate = '2026-04-18';
  const existing = upsertAbrsLedgerFiles(
    [],
    [file('Statistics-20260418~20260418_(0).xlsx')],
    targetDate,
  );
  const replaced = upsertAbrsLedgerFiles(
    existing,
    [file('Statistics-20260418~20260418_(1).xlsx')],
    targetDate,
  );

  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.file.name, 'Statistics-20260418~20260418_(1).xlsx');
});

test('validateAbrsLedgerFiles reports missing slots and target-date mismatches', () => {
  const targetDate = '2026-04-18';
  const entries = upsertAbrsLedgerFiles(
    [],
    [file('Statistics-20260417~20260417_(0).xlsx')],
    targetDate,
  );

  const validation = validateAbrsLedgerFiles(entries, targetDate);

  assert.equal(validation.ok, false);
  assert.match(validation.messages.join('\n'), /재고 현황/);
  assert.match(validation.messages.join('\n'), /광고비\/정산/);
  assert.match(validation.messages.join('\n'), /2026-04-18/);
});

test('validateAbrsLedgerFiles accepts the three required workbook slots', () => {
  const targetDate = '2026-04-18';
  const entries = upsertAbrsLedgerFiles(
    [],
    [
      file('inventory_health_sku_info_20260616220816.xlsx'),
      file('Statistics-20260418~20260418_(0).xlsx'),
      file('A01549099-dailySettlement-20260418-20260418.xlsx'),
    ],
    targetDate,
  );

  assert.deepEqual(validateAbrsLedgerFiles(entries, targetDate), {
    ok: true,
    messages: [],
  });
});

test('validateAbrsLedgerFiles keeps the product list optional', () => {
  const targetDate = '2026-04-18';
  const entries = upsertAbrsLedgerFiles(
    [],
    [
      file('inventory_health_sku_info_20260616220816.xlsx'),
      file('Statistics-20260418~20260418_(0).xlsx'),
      file('A01549099-dailySettlement-20260418-20260418.xlsx'),
      file('price_inventory_260717.xlsx'),
    ],
    targetDate,
  );

  assert.equal(entries.at(-1)?.slot, 'productList');
  assert.deepEqual(validateAbrsLedgerFiles(entries, targetDate), {
    ok: true,
    messages: [],
  });
});

test('createAbrsLedgerBatchName creates a stable per-day batch name', () => {
  assert.equal(createAbrsLedgerBatchName('2026-04-18'), 'abrs-2026-04-18');
});
