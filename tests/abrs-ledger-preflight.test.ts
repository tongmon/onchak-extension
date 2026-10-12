import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAbrsLedgerPreflightCanUpload } from '../src/pages/abrs-automation/model/abrs-ledger-preflight.ts';

test('permits server-approved snapshot review notices while requiring all thirteen source types', () => {
  assert.doesNotThrow(() => assertAbrsLedgerPreflightCanUpload({ canAnalyze: true, complete: false, missingFileTypes: [],
    files: [{ issues: [{ severity: 'REVIEW', message: '재고는 현재 조회 시점 자료' }] }], issues: [] }));
});
test('stops missing originals and mismatched seller/month errors before upload', () => {
  assert.throws(() => assertAbrsLedgerPreflightCanUpload({ canAnalyze: true, missingFileTypes: ['COUPANG_PPIR'], files: [] }), /누락 자료.*COUPANG_PPIR/);
  assert.throws(() => assertAbrsLedgerPreflightCanUpload({ canAnalyze: false, missingFileTypes: [],
    files: [{ issues: [{ severity: 'ERROR', message: '판매자 ID가 다릅니다' }] }] }), /판매자 ID/);
  assert.throws(() => assertAbrsLedgerPreflightCanUpload({ canAnalyze: true, missingFileTypes: [], files: [],
    issues: [{ severity: 'ERROR', message: '정산 파일 중복' }] }), /정산 파일 중복/);
});
test('does not treat incomplete or malformed inspection responses as success', () => {
  assert.throws(() => assertAbrsLedgerPreflightCanUpload({}), /응답을 확인/);
  assert.throws(() => assertAbrsLedgerPreflightCanUpload({ canAnalyze: 'true', missingFileTypes: [], files: [] }), /응답을 확인/);
});
