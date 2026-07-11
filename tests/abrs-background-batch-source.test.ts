import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('runtime message contracts expose persistent ABRS ledger batch actions', async () => {
  const contracts = await source(
    '../src/shared/extension/messaging/contracts.ts',
  );

  for (const messageType of [
    'abrs/get-ledger-batch',
    'abrs/save-ledger-batch-files',
    'abrs/clear-ledger-batch',
    'abrs/download-all-ledger-files',
    'abrs/get-ledger-target-date',
    'abrs/save-ledger-target-date',
  ]) {
    assert.match(contracts, new RegExp(`'${messageType}'`));
  }

  assert.match(contracts, /AbrsLedgerBatch/);
  assert.match(contracts, /AbrsLedgerDownloadSlotStatus/);
  assert.match(contracts, /AbrsLedgerSelectedTargetDate/);
});

test('background runtime persists ABRS batches and queries non-active Coupang tabs', async () => {
  const router = await source(
    '../src/app/entrypoints/background/runtime-router.ts',
  );

  assert.match(router, /ABRS_LEDGER_BATCH_STORAGE_PREFIX/);
  assert.match(router, /chrome\.storage\.local/);
  assert.match(router, /chrome\.tabs\.query/);
  assert.match(router, /handleDownloadAllAbrsLedgerFiles/);
  assert.match(router, /abrs\/download-all-ledger-files/);
});

test('background runtime persists the selected ABRS target date', async () => {
  const router = await source(
    '../src/app/entrypoints/background/runtime-router.ts',
  );

  assert.match(router, /ABRS_LEDGER_SELECTED_TARGET_DATE_STORAGE_KEY/);
  assert.match(router, /getStoredAbrsLedgerTargetDate/);
  assert.match(router, /setStoredAbrsLedgerTargetDate/);
  assert.match(router, /abrs\/get-ledger-target-date/);
  assert.match(router, /abrs\/save-ledger-target-date/);
});

test('background runtime handles Coupang xauth redirect by clicking the login continuation button', async () => {
  const router = await source(
    '../src/app/entrypoints/background/runtime-router.ts',
  );

  assert.match(router, /xauth\.coupang\.com/);
  assert.match(router, /redirect_uri/);
  assert.match(router, /clickCoupangAuthLoginButton/);
  assert.match(router, /로그인/);
});
