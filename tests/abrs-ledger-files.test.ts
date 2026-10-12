import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABRS_REQUIRED_LEDGER_SLOTS, ABRS_SETTLEMENT_SLOTS, ABRS_LEDGER_SLOT_DEFINITIONS,
  classifyAbrsLedgerFile, createAbrsLedgerBatchName, previousCompleteMonth,
  upsertAbrsLedgerFiles, validateAbrsLedgerFiles, getAbrsRequiredLedgerSlots, isAbrsLedgerSlotPeriodComplete,
} from '../src/pages/abrs-automation/model/abrs-ledger-files.ts';
import { createFileFromAbrsCoupangDownload } from '../src/pages/abrs-automation/api/abrs-coupang-download-file.ts';

function file(name: string): File { return new File(['xlsx'], name); }
const period = { start: '2026-09-01', end: '2026-09-30' };
const names = [
  'inventory_health_sku_info_20261011091520.xlsx',
  'Statistics-20260901~20260930_(0).xlsx',
  'A01549099_pa_daily_vendorItem_20260901_20260930.xlsx',
  'price_inventory_261011.xlsx',
  ...ABRS_SETTLEMENT_SLOTS.map((slot) => `A01549099-${slot}-20260901_20260930.xlsx`),
];
const dailyStatisticsNames = Array.from({ length: 30 }, (_, index) => {
  const day = `202609${String(index + 1).padStart(2, '0')}`;
  return `Statistics-${day}~${day}_(0).xlsx`;
});
function monthlyEntries() {
  return upsertAbrsLedgerFiles([], [...names.filter((_, index) => index !== 1), ...dailyStatisticsNames].map(file), period.end);
}

test('recognizes thirteen distinct original report types using backend capability names', () => {
  assert.equal(names.length, 13);
  assert.deepEqual(names.map((name) => classifyAbrsLedgerFile(name)?.slot), ABRS_REQUIRED_LEDGER_SLOTS);
  for (let index = 0; index < names.length; index += 1) {
    assert.equal(classifyAbrsLedgerFile(names[index])?.sourceType, ABRS_LEDGER_SLOT_DEFINITIONS[ABRS_REQUIRED_LEDGER_SLOTS[index]].sourceType);
  }
  assert.deepEqual(classifyAbrsLedgerFile(names[2])?.dateRange, period);
  assert.equal(classifyAbrsLedgerFile(names[0])?.dateRange, null);
  assert.equal(classifyAbrsLedgerFile('A01549099-BARCODE_LABELING_FEE-20260901_20260930.xlsx')?.slot, 'VALUE_ADDED_SERVICE_FEE');
});

test('legacy daily settlement remains recognized but is not a required thirteenth source', () => {
  assert.equal(classifyAbrsLedgerFile('A01549099-dailySettlement-20260930-20260930.xlsx')?.slot, 'dailySettlement');
  assert.ok(!ABRS_REQUIRED_LEDGER_SLOTS.includes('dailySettlement'));
  assert.equal(classifyAbrsLedgerFile('9월 상품 정보.xlsx'), null);
  assert.equal(classifyAbrsLedgerFile('not_CATEGORY_TR_fake.csv'), null);
  assert.equal(classifyAbrsLedgerFile('Statistics-20260230~20260230.xlsx'), null);
});

test('preserves distinct settlement statement periods and updates only the identical original file', () => {
  const first = file('A01549099-CATEGORY_TR-20260901_20260915.xlsx');
  const second = file('A01549099-CATEGORY_TR-20260916_20260930.xlsx');
  const replacement = new File(['updated'], first.name);
  const entries = upsertAbrsLedgerFiles([], [first, second, replacement], period.end);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.file, replacement);
  assert.equal(entries[1]?.file, second);
});

test('Statistics preserves distinct daily parts and updates only an identical original filename', () => {
  const entries = upsertAbrsLedgerFiles([], [file(names[1]), file('Statistics-20260901~20260930_(1).xlsx')], period.end);
  assert.equal(entries.length, 2);
  const replacement = new File(['updated'], names[1]);
  const updated = upsertAbrsLedgerFiles(entries, [replacement], period.end);
  assert.equal(updated.length, 2);
  assert.equal(updated[0].file, replacement);
  assert.match(updated[1].file.name, /\(1\)/);
});

test('core snapshot re-downloads replace the prior snapshot for the same slot', () => {
  const latest = file('inventory_health_sku_info_20261012120000.xlsx');
  const entries = upsertAbrsLedgerFiles([], [file(names[0]), latest], period.end);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].file, latest);
});

test('Chrome copy suffix refreshes a Statistics chunk while preserving distinct source chunks', () => {
  const first = file('Statistics-20260901~20260901_(0).xlsx');
  const shard = file('Statistics-20260901~20260901_(1).xlsx');
  const refreshed = file('Statistics-20260901~20260901_(0) (2).xlsx');
  const entries = upsertAbrsLedgerFiles([], [first, shard, refreshed], period.end);
  assert.deepEqual(entries.map((entry) => entry.file), [refreshed, shard]);
});

test('monthly validation accepts thirteen types and requires every one independently', () => {
  const entries = monthlyEntries();
  assert.deepEqual(validateAbrsLedgerFiles(entries, period.end, period), { ok: true, messages: [] });
  for (const slot of ABRS_REQUIRED_LEDGER_SLOTS) {
    const validation = validateAbrsLedgerFiles(entries.filter((entry) => entry.slot !== slot), period.end, period);
    assert.equal(validation.ok, false);
    assert.ok(validation.messages.some((message) => message.includes(ABRS_LEDGER_SLOT_DEFINITIONS[slot].label)));
  }
});

test('rejects mismatched ad/statistics ranges and reversed or cross-month input without fabricating dates', () => {
  const entries = monthlyEntries();
  const wrongAd = upsertAbrsLedgerFiles(entries, [file('A01549099_pa_daily_vendorItem_20260801_20260831.xlsx')], period.end);
  assert.match(validateAbrsLedgerFiles(wrongAd, period.end, period).messages.join('\n'), /광고 성과.*선택 기간/);
  assert.equal(validateAbrsLedgerFiles(entries, period.end, { start: '2026-09-30', end: '2026-09-01' }).ok, false);
  assert.equal(validateAbrsLedgerFiles(entries, period.end, { start: '2026-08-01', end: period.end }).ok, false);
  assert.equal(classifyAbrsLedgerFile('A01549099-CATEGORY_TR.xlsx')?.dateRange, null);
});

test('previous complete month handles year transition and leap years', () => {
  assert.deepEqual(previousCompleteMonth(new Date(2026, 0, 11)), { start: '2025-12-01', end: '2025-12-31' });
  assert.deepEqual(previousCompleteMonth(new Date(2024, 2, 1)), { start: '2024-02-01', end: '2024-02-29' });
  assert.equal(createAbrsLedgerBatchName(period.end), 'abrs-2026-09-30');
});

test('daily validation requires only four sources with exact single-day Statistics and ad periods', () => {
  const day = { start: period.end, end: period.end };
  const entries = upsertAbrsLedgerFiles([], [names[0], dailyStatisticsNames.at(-1)!,
    'A01549099_pa_daily_vendorItem_20260930_20260930.xlsx', names[3]].map(file), period.end);
  assert.deepEqual(getAbrsRequiredLedgerSlots(day), ABRS_REQUIRED_LEDGER_SLOTS.slice(0, 4));
  assert.deepEqual(validateAbrsLedgerFiles(entries, period.end, day), { ok: true, messages: [] });
  assert.equal(validateAbrsLedgerFiles(entries.filter((entry) => entry.slot !== 'salesStatistics'), period.end, day).ok, false);
});

test('monthly validation requires every daily Statistics original and rejects monthly totals', () => {
  const entries = monthlyEntries();
  assert.equal(entries.filter((entry) => entry.slot === 'salesStatistics').length, 30);
  assert.equal(isAbrsLedgerSlotPeriodComplete(entries, 'salesStatistics', period), true);
  const missingDay = entries.filter((entry) => entry.file.name !== dailyStatisticsNames[14]);
  assert.equal(isAbrsLedgerSlotPeriodComplete(missingDay, 'salesStatistics', period), false);
  assert.match(validateAbrsLedgerFiles(missingDay, period.end, period).messages.join('\n'), /모든 날짜별 Statistics/);
  const aggregate = upsertAbrsLedgerFiles(entries.filter((entry) => entry.slot !== 'salesStatistics'), [file(names[1])], period.end);
  assert.equal(isAbrsLedgerSlotPeriodComplete(aggregate, 'salesStatistics', period), false);
  assert.match(validateAbrsLedgerFiles(aggregate, period.end, period).messages.join('\n'), /월 합계 파일/);
});

test('settlement UUID filenames retain individual source weeks for validation and coverage', () => {
  const weeks = [{ start: '2026-09-01', end: '2026-09-06' }, { start: '2026-09-07', end: '2026-09-13' },
    { start: '2026-09-14', end: '2026-09-20' }, { start: '2026-09-21', end: '2026-09-27' }, { start: '2026-09-28', end: '2026-09-30' }];
  const files = weeks.map((sourcePeriod, index) => createFileFromAbrsCoupangDownload({
    fileName: `A01549099-CATEGORY_TR-ko-uuid-${index}.xlsx`, mimeType: 'application/vnd.ms-excel', base64: btoa('xlsx'), sourcePeriod,
  }));
  const entries = upsertAbrsLedgerFiles([], files, period.end);
  assert.deepEqual(entries.map((entry) => entry.dateRange), weeks);
  assert.equal(isAbrsLedgerSlotPeriodComplete(entries, 'CATEGORY_TR', period), true);
  assert.equal(isAbrsLedgerSlotPeriodComplete(entries.slice(1), 'CATEGORY_TR', period), false);
});

test('monthly validation refuses settlement originals with only one week or unknown source periods', () => {
  const remaining = monthlyEntries().filter((entry) => entry.slot !== 'CATEGORY_TR');
  for (const replacement of [
    file('A01549099-CATEGORY_TR-20260901_20260906.xlsx'),
    file('A01549099-CATEGORY_TR-ko-uuid-without-period.xlsx'),
  ]) {
    const entries = upsertAbrsLedgerFiles(remaining, [replacement], period.end);
    assert.equal(entries.some((entry) => entry.slot === 'CATEGORY_TR'), true, 'The source kind exists but its monthly coverage is unproven');
    assert.equal(isAbrsLedgerSlotPeriodComplete(entries, 'CATEGORY_TR', period), false);
    const validation = validateAbrsLedgerFiles(entries, period.end, period);
    assert.equal(validation.ok, false);
    assert.ok(validation.messages.some((message) => message.includes('주문·판매수수료')));
  }
});
