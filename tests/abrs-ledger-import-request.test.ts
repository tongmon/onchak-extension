import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertAbrsLedgerFiles } from '../src/pages/abrs-automation/model/abrs-ledger-files.ts';
import {
  abrsLedgerImportPath,
  buildAbrsLedgerImportFormData,
  buildAbrsLedgerImportUrl,
  createAbrsLedgerImportHeaders,
  extractAbrsLedgerImportErrorMessage,
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
    ],
  );
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
