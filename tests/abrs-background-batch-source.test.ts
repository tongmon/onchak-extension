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
    'abrs/download-cached-ledger-file',
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
  const rowDownload = await source(
    '../src/pages/abrs-automation/api/download-abrs-coupang-ledger-file.ts',
  );

  assert.match(router, /ABRS_LEDGER_BATCH_STORAGE_PREFIX/);
  assert.match(router, /chrome\.storage\.local/);
  assert.match(router, /chrome\.tabs\.query/);
  assert.match(router, /handleDownloadAllAbrsLedgerFiles/);
  assert.match(router, /abrs\/download-all-ledger-files/);
  assert.match(router, /chrome\.downloads\.download/);
  assert.match(router, /handleDownloadCachedAbrsLedgerFile/);
  assert.match(
    router,
    /handleDownloadActiveTabAbrsLedgerFile[\s\S]*downloadAbrsLedgerSlot\(payload\.slot, payload\.targetDate\)/,
  );
  assert.doesNotMatch(router, /fallbackTab[\s\S]*sendTabMessage\(fallbackTab\.id/);
  assert.match(rowDownload, /chrome\.tabs\.query/);
  assert.match(rowDownload, /sendTabMessage\(compatibleTab\.id/);
  assert.match(rowDownload, /isMissingReceiverError/);
  assert.match(rowDownload, /if \(!isMissingReceiverError\(error\)\) \{\s*throw error;/);
  assert.match(rowDownload, /sendRuntimeMessage/);
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

test('background runtime never submits Coupang xauth credential forms', async () => {
  const router = await source(
    '../src/app/entrypoints/background/runtime-router.ts',
  );

  assert.match(router, /xauth\.coupang\.com/);
  assert.match(router, /redirect_uri/);
  assert.match(router, /clickCoupangAuthLoginButton/);
  assert.match(router, /로그인/);
  assert.match(router, /hasCredentialForm/);
  assert.doesNotMatch(router, /everyCredentialInputIsBlank/);
  assert.match(router, /if \(hasCredentialForm\) \{\s*return false;\s*\}/);
  assert.match(router, /Coupang 인증 화면에서 직접 로그인이 필요합니다/);
  assert.match(router, /COUPANG_DIRECT_LOGIN_REQUIRED_MESSAGE/);
  assert.match(
    router,
    /if \(!isCoupangAuthTabForSlot\(tab, slot\)\) \{\s*return tab;\s*\}\s*throw new Error\(COUPANG_DIRECT_LOGIN_REQUIRED_MESSAGE\);/,
  );
});

test('background runtime starts Coupang ads downloads from dashboard without stealing popup focus', async () => {
  const router = await source(
    '../src/app/entrypoints/background/runtime-router.ts',
  );

  assert.match(router, /https:\/\/advertising\.coupang\.com\/marketing\/dashboard/);
  assert.doesNotMatch(
    router,
    /const ADS_LEDGER_START_URL =\s*['"]https:\/\/advertising\.coupang\.com\/user\/login/,
  );
  assert.match(router, /function isAdsLoginTab/);
  assert.match(router, /pathname\.startsWith\('\/user\/login'\)/);
  assert.match(router, /function isAdsDataTab/);
  assert.match(router, /isAdsTab\(tab\) && !isAdsLoginTab\(tab\)/);
  assert.doesNotMatch(
    router,
    /slot === 'dailySettlement' && isAdsLoginTab\(tab\)[\s\S]{0,80}return true/,
  );
  assert.match(router, /function prepareAbrsTab/);
  assert.doesNotMatch(router, /chrome\.windows\.update/);
  assert.doesNotMatch(router, /chrome\.tabs\.update\(tab\.id, \{ active: true \}\)/);
  assert.match(router, /active: false/);
  assert.match(router, /function waitForStableAbrsTab/);
  assert.match(router, /stableCount >= 2/);
  assert.match(router, /function assertAbrsTabReadyForSlot/);
  assert.match(router, /COUPANG_ADS_LOGIN_REQUIRED_MESSAGE/);
  assert.match(
    router,
    /slot === 'dailySettlement' && isAdsLoginTab\(stableTab\)/,
  );
});
