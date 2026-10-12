import assert from 'node:assert/strict';
import test from 'node:test';
import { createAbrsLedgerCachedDownloadUrl, createFileFromAbrsCoupangDownload, getAbrsCoupangFileSourcePeriod, isAbrsLedgerXlsxPayload } from '../src/pages/abrs-automation/api/abrs-coupang-download-file.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';

const bytes = createDailySettlementWorkbookBytes({});
const original = {
  fileName: 'Statistics-20260901~20260930_(0).xlsx',
  mimeType: 'application/vnd.ms-excel',
  base64: Buffer.from(bytes).toString('base64'),
};

test('a verified OOXML original uses the XLSX download MIME without changing its bytes or filename', () => {
  const url = createAbrsLedgerCachedDownloadUrl(original);
  assert.match(url, /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/);
  assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), Buffer.from(bytes));
  assert.equal(original.fileName, 'Statistics-20260901~20260930_(0).xlsx');
  assert.equal(original.mimeType, 'application/vnd.ms-excel');
  assert.equal(isAbrsLedgerXlsxPayload(original, bytes.length), true);
  assert.equal(isAbrsLedgerXlsxPayload(original, bytes.length + 1), false);
});

test('HTML, malformed base64, and truncated ZIP cache entries are not promoted to XLSX downloads', () => {
  for (const base64 of [Buffer.from('<html>login</html>').toString('base64'), '***', Buffer.from(bytes.slice(0, -22)).toString('base64')]) {
    assert.equal(isAbrsLedgerXlsxPayload({ ...original, base64 }), false);
    assert.throws(() => createAbrsLedgerCachedDownloadUrl({ ...original, base64 }), /Excel 원본/);
  }
});

test('a legacy .xls filename is never renamed or accepted as OOXML by MIME correction', () => {
  const legacy = { ...original, fileName: 'save.xls' };
  assert.equal(isAbrsLedgerXlsxPayload(legacy), false);
  assert.throws(() => createAbrsLedgerCachedDownloadUrl(legacy), /Excel 원본/);
  assert.equal(legacy.fileName, 'save.xls');
});

test('source periods stay attached to the original File without exposing mutable metadata', () => {
  const sourcePeriod = { start: '2026-09-07', end: '2026-09-13' };
  const file = createFileFromAbrsCoupangDownload({ ...original, fileName: 'A000-CATEGORY_TR-ko-original.xlsx', sourcePeriod });
  sourcePeriod.start = '2026-09-01';
  assert.deepEqual(getAbrsCoupangFileSourcePeriod(file), { start: '2026-09-07', end: '2026-09-13' });
  const result = getAbrsCoupangFileSourcePeriod(file)!;
  result.end = '2026-09-30';
  assert.deepEqual(getAbrsCoupangFileSourcePeriod(file), { start: '2026-09-07', end: '2026-09-13' });
  assert.equal(getAbrsCoupangFileSourcePeriod(createFileFromAbrsCoupangDownload(original)), undefined);
});

test('source provenance rejects invalid calendar dates, reversed ranges and filename conflicts', () => {
  for (const sourcePeriod of [
    { start: '2026-02-30', end: '2026-03-01' },
    { start: '2026-09-14', end: '2026-09-13' },
    { start: '2026-09-07T00:00:00Z', end: '2026-09-13' },
  ]) assert.throws(() => createFileFromAbrsCoupangDownload({ ...original, sourcePeriod }), /조회 기간 정보/);
  assert.throws(() => createFileFromAbrsCoupangDownload({ ...original,
    sourcePeriod: { start: '2026-09-07', end: '2026-09-13' },
  }), /파일명과 조회 기간/);
  assert.doesNotThrow(() => createFileFromAbrsCoupangDownload({ ...original,
    sourcePeriod: { start: '2026-09-01', end: '2026-09-30' },
  }));
});
