import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertAbrsLedgerFiles } from '../src/pages/abrs-automation/model/abrs-ledger-files.ts';
import {
  abrsLedgerImportPath,
  buildAbrsLedgerImportFormData,
  buildAbrsLedgerImportUrl,
  createAbrsLedgerImportHeaders,
  extractAbrsLedgerImportErrorMessage,
  buildAbrsLedgerPeriodFormData,
  assertAbrsLedgerPeriodReceipt,
} from '../src/pages/abrs-automation/api/abrs-ledger-import-request.ts';

function workbook(name: string): File {
  return new File(['xlsx'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

test('buildAbrsLedgerImportFormData creates the OMS ledger import multipart payload', () => {
  const targetDate = '2026-04-18';
  const entries = upsertAbrsLedgerFiles(
    [],
    [
      workbook('inventory_health_sku_info_20260616220816.xlsx'),
      workbook('Statistics-20260418~20260418_(0).xlsx'),
      workbook('A01549099-dailySettlement-20260418-20260418.xlsx'),
      workbook('price_inventory_260717.xlsx'),
    ],
    targetDate,
  );

  const formData = buildAbrsLedgerImportFormData({
    targetDate,
    batchName: 'abrs-2026-04-18',
    entries,
  });

  assert.equal(formData.get('targetDate'), targetDate);
  assert.equal(formData.get('batchName'), 'abrs-2026-04-18');
  assert.deepEqual(
    formData.getAll('files').map((value) => (value as File).name),
    [
      'inventory_health_sku_info_20260616220816.xlsx',
      'Statistics-20260418~20260418_(0).xlsx',
      'A01549099-dailySettlement-20260418-20260418.xlsx',
      'price_inventory_260717.xlsx',
    ],
  );
});

test('period multipart carries the selected mode and original statement week instead of only a month-end anchor', () => {
  const entries = upsertAbrsLedgerFiles([], [workbook('A01549099-CATEGORY_TR-20260907_20260913.xlsx')], '2026-09-30');
  const form = buildAbrsLedgerPeriodFormData({ targetDate: '2026-09-30', batchName: 'monthly', entries,
    period: { start: '2026-09-01', end: '2026-09-30' }, uploadMode: 'monthly' });
  assert.equal(form.get('ingestionMode'), 'MONTHLY');
  assert.equal(form.get('periodStart'), '2026-09-01');
  assert.equal(form.get('periodEnd'), '2026-09-30');
  assert.deepEqual(JSON.parse(String(form.get('sourcePeriods'))), [{
    fileName: entries[0].file.name, periodStart: '2026-09-07', periodEnd: '2026-09-13',
  }]);
  assert.equal(form.getAll('files').length, 1);
});

function monthlyReceipt(): Record<string, unknown> {
  return { status: 'IMPORTED', ingestionMode: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30',
    importId: 'receipt-30', imports: Array.from({ length: 30 }, (_, index) => ({
      targetDate: `2026-09-${String(index + 1).padStart(2, '0')}`, importId: `receipt-${index + 1}`, status: 'IMPORTED',
    })) };
}

test('monthly receipt must confirm every date before originals can be cleared', () => {
  const period = { start: '2026-09-01', end: '2026-09-30' };
  assert.equal(assertAbrsLedgerPeriodReceipt(monthlyReceipt(), period, 'monthly'), 30);
  const partial = monthlyReceipt();
  partial.imports = (partial.imports as unknown[]).slice(1);
  assert.throws(() => assertAbrsLedgerPeriodReceipt(partial, period, 'monthly'), /파일은 보관/);
  const duplicate = monthlyReceipt();
  (duplicate.imports as unknown[])[0] = (duplicate.imports as unknown[])[1];
  assert.throws(() => assertAbrsLedgerPeriodReceipt(duplicate, period, 'monthly'), /파일은 보관/);
  const duplicateId = monthlyReceipt();
  (duplicateId.imports as Array<Record<string, unknown>>)[0].importId = 'receipt-2';
  assert.throws(() => assertAbrsLedgerPeriodReceipt(duplicateId, period, 'monthly'), /파일은 보관/);
  const blankId = monthlyReceipt();
  (blankId.imports as Array<Record<string, unknown>>)[0].importId = '  ';
  assert.throws(() => assertAbrsLedgerPeriodReceipt(blankId, period, 'monthly'), /파일은 보관/);
  assert.throws(() => assertAbrsLedgerPeriodReceipt({ ...monthlyReceipt(), ingestionMode: 'DAILY' }, period, 'monthly'), /파일은 보관/);
  assert.throws(() => assertAbrsLedgerPeriodReceipt({ ...monthlyReceipt(), importId: 'old-receipt' }, period, 'monthly'), /파일은 보관/);
});

test('a legacy single-date receipt cannot acknowledge a new period upload', () => {
  assert.throws(() => assertAbrsLedgerPeriodReceipt({ importId: 'old', status: 'IMPORTED' },
    { start: '2026-09-30', end: '2026-09-30' }, 'daily'), /파일은 보관/);
});

test('daily period payload excludes settlement files from an older thirteen-type cache', () => {
  const entries = upsertAbrsLedgerFiles([], [
    'Statistics-20260930~20260930_(0).xlsx', 'inventory_health_sku_info_20261011091520.xlsx',
    'price_inventory_261011.xlsx', 'A01549099_pa_daily_vendorItem_20260930_20260930.xlsx',
    'A01549099-CATEGORY_TR-20260901_20260930.xlsx',
  ].map(workbook), '2026-09-30');
  const form = buildAbrsLedgerPeriodFormData({ targetDate: '2026-09-30', batchName: 'daily', entries,
    period: { start: '2026-09-30', end: '2026-09-30' }, uploadMode: 'daily' });
  assert.equal(form.getAll('files').length, 4);
  assert.deepEqual(JSON.parse(String(form.get('sourcePeriods'))), []);
});

test('buildAbrsLedgerImportUrl resolves relative API paths against the configured base URL', () => {
  assert.equal(
    buildAbrsLedgerImportUrl('http://localhost:8080', abrsLedgerImportPath),
    'http://localhost:8080/api/ledger/imports',
  );
  assert.equal(
    buildAbrsLedgerImportUrl(
      'https://zephlyglobal.com/',
      '/api/ledger/imports',
    ),
    'https://zephlyglobal.com/api/ledger/imports',
  );
});

test('createAbrsLedgerImportHeaders creates auth headers without forcing multipart content-type', () => {
  const headers = createAbrsLedgerImportHeaders({
    accessToken: 'token-123',
    csrfToken: 'csrf-123',
    tokenType: 'Bearer',
  });

  assert.equal(headers.Accept, 'application/json');
  assert.equal(headers.Authorization, 'Bearer token-123');
  assert.equal(headers['X-CSRF-Token'], 'csrf-123');
  assert.equal(headers['X-Requested-With'], 'XMLHttpRequest');
  assert.equal('Content-Type' in headers, false);
});

test('extractAbrsLedgerImportErrorMessage reads nested backend error payloads', () => {
  assert.equal(
    extractAbrsLedgerImportErrorMessage(
      { data: { message: '업로드 날짜가 맞지 않습니다.' } },
      'fallback',
    ),
    '업로드 날짜가 맞지 않습니다.',
  );
  assert.equal(extractAbrsLedgerImportErrorMessage(null, 'fallback'), 'fallback');
});
