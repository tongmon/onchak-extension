import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAbrsLedgerEntriesForReplacement } from '../src/app/entrypoints/background/abrs-ledger-replacements.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';
import { classifyAbrsLedgerFile } from '../src/pages/abrs-automation/model/abrs-ledger-files.ts';
import type { AbrsCoupangLedgerDownloadSlot, AbrsLedgerPersistedEntry } from '../src/shared/extension/messaging/contracts.ts';

function entry(fileName: string): AbrsLedgerPersistedEntry {
  const bytes = createDailySettlementWorkbookBytes({});
  return { ...classifyAbrsLedgerFile(fileName)!, fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: Buffer.from(bytes).toString('base64'), size: bytes.length, savedAt: '2026-10-11T00:00:00Z' };
}
const old = entry('A00000000-CATEGORY_TR-ko-old.xlsx');
const fresh = entry('A00000000-CATEGORY_TR-ko-new.xlsx');
const stock = entry('inventory_health_sku_info_20261011120000.xlsx');

test('automatic replacement removes only an explicitly supplied slot and preserves unrelated originals', () => {
  const existing = [old, stock];
  assert.deepEqual(filterAbrsLedgerEntriesForReplacement(existing, [fresh, stock], ['CATEGORY_TR']), [stock]);
  assert.deepEqual(existing, [old, stock]);
});

test('manual append without replaceSlots leaves every existing original available', () => {
  assert.deepEqual(filterAbrsLedgerEntriesForReplacement([old, stock], [fresh]), [old, stock]);
  assert.deepEqual(filterAbrsLedgerEntriesForReplacement([old, stock], [fresh], []), [old, stock]);
});

test('replacement rejects missing incoming originals or unsupported slots before removing anything', () => {
  assert.throws(() => filterAbrsLedgerEntriesForReplacement([old, stock], [stock], ['CATEGORY_TR']), /새 Excel 원본/);
  assert.throws(() => filterAbrsLedgerEntriesForReplacement([old], [fresh], ['unknown' as AbrsCoupangLedgerDownloadSlot]), /새 Excel 원본/);
});

test('replacement rejects mismatched filename, source type, corrupt bytes and wrong size', () => {
  for (const corrupted of [
    { ...fresh, fileName: 'STORAGE_FEE.xlsx' },
    { ...fresh, sourceType: stock.sourceType },
    { ...fresh, base64: 'bm90LWV4Y2Vs' },
    { ...fresh, size: fresh.size + 1 },
    { ...fresh, size: 0 },
  ]) assert.throws(() => filterAbrsLedgerEntriesForReplacement([old, stock], [corrupted], ['CATEGORY_TR']), /새 Excel 원본/);
});
