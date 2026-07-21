import {
  extensionStorage,
  getCurrentActiveTab,
  messageFailure,
  messageSuccess,
  sendTabMessage,
  type ActiveTabSnapshot,
  type AbrsCoupangLedgerDownload,
  type AbrsCoupangLedgerDownloadSlot,
  type AbrsLedgerBatch,
  type AbrsLedgerDownloadSlotStatus,
  type AbrsLedgerPersistedEntry,
  type RuntimeMessage,
  type RuntimeMessageMap,
  type TabMessage,
  type TabMessageMap,
  type TabMessageType,
} from '@/shared/extension';
import { upsertAbrsLedgerPersistedDownloads } from '@/pages/abrs-automation/model/abrs-ledger-batch-cache';

const CONTENT_SCRIPT_REFRESH_REQUIRED_MESSAGE =
  '현재 탭에 content script가 연결되지 않았습니다. 탭을 새로고침한 뒤 다시 시도해주세요.';
const COUPANG_ADS_LOGIN_REQUIRED_MESSAGE =
  'Coupang 광고센터 로그인 세션이 필요합니다. https://advertising.coupang.com/marketing/dashboard 를 연 뒤 로그인 상태를 확인해주세요.';
const COUPANG_DIRECT_LOGIN_REQUIRED_MESSAGE =
  'Coupang 인증 화면에서 직접 로그인이 필요합니다. 열린 Coupang 로그인 탭에서 로그인한 뒤 다시 시도해주세요.';
const ABRS_LEDGER_BATCH_STORAGE_PREFIX = 'abrsLedgerBatch:';
const ABRS_LEDGER_SELECTED_TARGET_DATE_STORAGE_KEY =
  'abrsLedgerSelectedTargetDate';
const ABRS_LEDGER_DOWNLOAD_SLOTS: AbrsCoupangLedgerDownloadSlot[] = [
  'inventoryHealth',
  'salesStatistics',
  'dailySettlement',
];
const WING_LEDGER_START_URL =
  'https://wing.coupang.com/tenants/rfm-inventory/management/list';
const WING_PRODUCT_LIST_START_URL =
  'https://wing.coupang.com/vendor-inventory/list';
const ADS_LEDGER_START_URL =
  'https://advertising.coupang.com/marketing/dashboard';
const COUPANG_AUTH_HOST = 'xauth.coupang.com';

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

function isMissingReceiverError(error: unknown): boolean {
  const errorMessage =
    error instanceof Error ? error.message : String(error ?? '');

  return errorMessage.includes('Receiving end does not exist');
}

function getPrimaryContentScriptFile(): string {
  const contentScriptFile = chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0];

  if (!contentScriptFile) {
    throw new Error('Content script file is not defined in the manifest.');
  }

  return contentScriptFile;
}

function isDevLoaderScriptFile(contentScriptFile: string): boolean {
  return contentScriptFile.startsWith('src/') && contentScriptFile.includes('-loader');
}

async function injectPrimaryContentScript(tabId: number): Promise<void> {
  const contentScriptFile = getPrimaryContentScriptFile();

  if (isDevLoaderScriptFile(contentScriptFile)) {
    throw new Error(CONTENT_SCRIPT_REFRESH_REQUIRED_MESSAGE);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [contentScriptFile],
    });
  } catch {
    throw new Error(CONTENT_SCRIPT_REFRESH_REQUIRED_MESSAGE);
  }
}

async function sendTabMessageWithRecovery<T extends TabMessageType>(
  tabId: number,
  message: TabMessage<T>,
): Promise<TabMessageMap[T]['response']> {
  try {
    return await sendTabMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await injectPrimaryContentScript(tabId);
    await delay(150);

    try {
      return await sendTabMessage(tabId, message);
    } catch (retryError) {
      if (isMissingReceiverError(retryError)) {
        throw new Error(CONTENT_SCRIPT_REFRESH_REQUIRED_MESSAGE);
      }

      throw retryError;
    }
  }
}

async function buildActiveTabSnapshot(): Promise<ActiveTabSnapshot> {
  const activeTab = await getCurrentActiveTab();

  if (!activeTab?.id) {
    return {
      tabId: null,
      tabTitle: null,
      tabUrl: null,
      pageTitle: null,
      contentScriptConnected: false,
      overlayEnabled: false,
    };
  }

  try {
    const domSnapshot = await sendTabMessageWithRecovery(activeTab.id, {
      type: 'page/get-dom-snapshot',
    });

    return {
      tabId: activeTab.id,
      tabTitle: activeTab.title ?? null,
      tabUrl: activeTab.url ?? null,
      pageTitle: domSnapshot.title,
      contentScriptConnected: true,
      overlayEnabled: domSnapshot.overlayEnabled,
    };
  } catch {
    return {
      tabId: activeTab.id,
      tabTitle: activeTab.title ?? null,
      tabUrl: activeTab.url ?? null,
      pageTitle: activeTab.title ?? null,
      contentScriptConnected: false,
      overlayEnabled: false,
    };
  }
}

async function handleGetExtensionContext(): Promise<
  RuntimeMessageMap['system/get-extension-context']['response']
> {
  await extensionStorage.ensureDefaults();

  return {
    extensionVersion: chrome.runtime.getManifest().version,
    handledAt: new Date().toISOString(),
    storageArea: 'sync',
    activeTab: await buildActiveTabSnapshot(),
  };
}

async function handleGetActiveTabPopularSearchData(): Promise<
  RuntimeMessageMap['page/get-active-tab-popular-search-data']['response']
> {
  const activeTab = await getCurrentActiveTab();

  if (!activeTab?.id) {
    throw new Error('현재 활성 탭을 찾을 수 없습니다.');
  }

  try {
    const response = await sendTabMessageWithRecovery(activeTab.id, {
      type: 'page/get-popular-search-data',
    });

    return response;
  } catch (error) {
    throw error;
  }
}

async function handleSetActiveTabOverlay(
  enabled: boolean,
): Promise<RuntimeMessageMap['page/set-active-tab-overlay']['response']> {
  const activeTab = await getCurrentActiveTab();

  if (!activeTab?.id) {
    return {
      applied: false,
      tabId: null,
      contentScriptConnected: false,
    };
  }

  try {
    await sendTabMessageWithRecovery(activeTab.id, {
      type: 'page/set-overlay',
      payload: { enabled },
    });

    return {
      applied: true,
      tabId: activeTab.id,
      contentScriptConnected: true,
    };
  } catch {
    return {
      applied: false,
      tabId: activeTab.id,
      contentScriptConnected: false,
    };
  }
}

async function handleGetActiveTabAbrsCoupangPage(): Promise<
  RuntimeMessageMap['abrs/get-active-tab-coupang-page']['response']
> {
  const activeTab = await getCurrentActiveTab();

  if (!activeTab?.id) {
    throw new Error('현재 활성 탭을 찾을 수 없습니다.');
  }

  return sendTabMessageWithRecovery(activeTab.id, {
    type: 'abrs/get-coupang-page',
  });
}

async function handleDownloadActiveTabAbrsLedgerFile(
  payload: RuntimeMessageMap['abrs/download-active-tab-ledger-file']['request'],
): Promise<RuntimeMessageMap['abrs/download-active-tab-ledger-file']['response']> {
  const result = await downloadAbrsLedgerSlot(payload.slot, payload.targetDate);

  if (result.download) {
    return result.download;
  }

  throw new Error(result.status.error ?? 'Coupang 파일을 가져오지 못했습니다.');
}

function createAbrsLedgerBatchStorageKey(targetDate: string): string {
  return `${ABRS_LEDGER_BATCH_STORAGE_PREFIX}${targetDate}`;
}

function isValidAbrsLedgerTargetDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getStoredAbrsLedgerTargetDate(
  fallbackDate: string,
): Promise<RuntimeMessageMap['abrs/get-ledger-target-date']['response']> {
  const result = (await chrome.storage.local.get([
    ABRS_LEDGER_SELECTED_TARGET_DATE_STORAGE_KEY,
  ])) as Record<string, unknown>;
  const storedTargetDate = result[ABRS_LEDGER_SELECTED_TARGET_DATE_STORAGE_KEY];

  return {
    targetDate: isValidAbrsLedgerTargetDate(storedTargetDate)
      ? storedTargetDate
      : fallbackDate,
  };
}

async function setStoredAbrsLedgerTargetDate(
  targetDate: string,
): Promise<RuntimeMessageMap['abrs/save-ledger-target-date']['response']> {
  if (!isValidAbrsLedgerTargetDate(targetDate)) {
    throw new Error('장부 날짜 형식이 올바르지 않습니다.');
  }

  await chrome.storage.local.set({
    [ABRS_LEDGER_SELECTED_TARGET_DATE_STORAGE_KEY]: targetDate,
  });

  return { targetDate };
}

function createEmptyAbrsLedgerBatch(targetDate: string): AbrsLedgerBatch {
  return {
    targetDate,
    updatedAt: null,
    entries: [],
  };
}

function normalizeAbrsLedgerBatch(
  targetDate: string,
  value: unknown,
): AbrsLedgerBatch {
  if (!value || typeof value !== 'object') {
    return createEmptyAbrsLedgerBatch(targetDate);
  }

  const candidate = value as Partial<AbrsLedgerBatch>;

  return {
    targetDate,
    updatedAt:
      typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
    entries: Array.isArray(candidate.entries) ? candidate.entries : [],
  };
}

async function getStoredAbrsLedgerBatch(targetDate: string): Promise<AbrsLedgerBatch> {
  const storageKey = createAbrsLedgerBatchStorageKey(targetDate);
  const result = (await chrome.storage.local.get([storageKey])) as Record<
    string,
    unknown
  >;

  return normalizeAbrsLedgerBatch(targetDate, result[storageKey]);
}

async function setStoredAbrsLedgerBatch(
  batch: AbrsLedgerBatch,
): Promise<AbrsLedgerBatch> {
  const nextBatch: AbrsLedgerBatch = {
    ...batch,
    updatedAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({
    [createAbrsLedgerBatchStorageKey(batch.targetDate)]: nextBatch,
  });

  return nextBatch;
}

function upsertPersistedEntries(
  existingEntries: AbrsLedgerPersistedEntry[],
  incomingEntries: AbrsLedgerPersistedEntry[],
): AbrsLedgerPersistedEntry[] {
  return incomingEntries.reduce<AbrsLedgerPersistedEntry[]>((entries, entry) => {
    const existingIndex = entries.findIndex(
      (candidate) => candidate.slot === entry.slot,
    );

    if (existingIndex >= 0) {
      const nextEntries = [...entries];
      nextEntries[existingIndex] = entry;
      return nextEntries;
    }

    return [...entries, entry];
  }, [...existingEntries]);
}

async function handleGetAbrsLedgerBatch(
  payload: RuntimeMessageMap['abrs/get-ledger-batch']['request'],
): Promise<RuntimeMessageMap['abrs/get-ledger-batch']['response']> {
  return getStoredAbrsLedgerBatch(payload.targetDate);
}

async function handleSaveAbrsLedgerBatchFiles(
  payload: RuntimeMessageMap['abrs/save-ledger-batch-files']['request'],
): Promise<RuntimeMessageMap['abrs/save-ledger-batch-files']['response']> {
  const currentBatch = await getStoredAbrsLedgerBatch(payload.targetDate);

  return setStoredAbrsLedgerBatch({
    targetDate: payload.targetDate,
    updatedAt: currentBatch.updatedAt,
    entries: upsertPersistedEntries(currentBatch.entries, payload.entries),
  });
}

async function handleClearAbrsLedgerBatch(
  payload: RuntimeMessageMap['abrs/clear-ledger-batch']['request'],
): Promise<RuntimeMessageMap['abrs/clear-ledger-batch']['response']> {
  await chrome.storage.local.remove(
    createAbrsLedgerBatchStorageKey(payload.targetDate),
  );

  return createEmptyAbrsLedgerBatch(payload.targetDate);
}

function getTabUrl(tab: chrome.tabs.Tab): URL | null {
  if (!tab.url) {
    return null;
  }

  try {
    return new URL(tab.url);
  } catch {
    return null;
  }
}

function isWingTab(tab: chrome.tabs.Tab): boolean {
  return getTabUrl(tab)?.hostname.toLowerCase() === 'wing.coupang.com';
}

function isAdsTab(tab: chrome.tabs.Tab): boolean {
  const hostname = getTabUrl(tab)?.hostname.toLowerCase();

  return hostname === 'advertising.coupang.com' || hostname === 'ads.coupang.com';
}

function isAdsLoginTab(tab: chrome.tabs.Tab): boolean {
  const url = getTabUrl(tab);

  if (!url) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  return (
    (hostname === 'advertising.coupang.com' || hostname === 'ads.coupang.com') &&
    pathname.startsWith('/user/login')
  );
}

function isAdsDataTab(tab: chrome.tabs.Tab): boolean {
  return isAdsTab(tab) && !isAdsLoginTab(tab);
}

function getCoupangAuthRedirectUrl(tab: chrome.tabs.Tab): URL | null {
  const url = getTabUrl(tab);

  if (url?.hostname.toLowerCase() !== COUPANG_AUTH_HOST) {
    return null;
  }

  const redirectUri = url.searchParams.get('redirect_uri');

  if (!redirectUri) {
    return null;
  }

  try {
    return new URL(redirectUri);
  } catch {
    return null;
  }
}

function isCoupangAuthTabForSlot(
  tab: chrome.tabs.Tab,
  slot: AbrsCoupangLedgerDownloadSlot,
): boolean {
  const redirectUrl = getCoupangAuthRedirectUrl(tab);

  if (!redirectUrl) {
    return false;
  }

  const redirectHostname = redirectUrl.hostname.toLowerCase();

  return slot === 'dailySettlement'
    ? redirectHostname === 'advertising.coupang.com' ||
        redirectHostname === 'ads.coupang.com'
    : redirectHostname === 'wing.coupang.com';
}

function isTabUsableForAbrsSlot(
  tab: chrome.tabs.Tab,
  slot: AbrsCoupangLedgerDownloadSlot,
): boolean {
  if (slot === 'dailySettlement' ? isAdsDataTab(tab) : isWingTab(tab)) {
    return true;
  }

  return isCoupangAuthTabForSlot(tab, slot);
}

function getAbrsSlotStartUrl(slot: AbrsCoupangLedgerDownloadSlot): string {
  if (slot === 'dailySettlement') {
    return ADS_LEDGER_START_URL;
  }

  return slot === 'productList'
    ? WING_PRODUCT_LIST_START_URL
    : WING_LEDGER_START_URL;
}

function safeDownloadFileName(fileName: string): string {
  const normalized = fileName.split(/[\\/]/).pop()?.trim();

  if (!normalized) {
    throw new Error('다운로드할 장부 파일명이 올바르지 않습니다.');
  }

  return normalized;
}

async function handleDownloadCachedAbrsLedgerFile(
  payload: RuntimeMessageMap['abrs/download-cached-ledger-file']['request'],
): Promise<RuntimeMessageMap['abrs/download-cached-ledger-file']['response']> {
  const batch = await getStoredAbrsLedgerBatch(payload.targetDate);
  const entry = batch.entries.find((candidate) => candidate.slot === payload.slot);

  if (!entry) {
    throw new Error('저장된 장부 파일을 찾지 못했습니다.');
  }

  const fileName = safeDownloadFileName(entry.fileName);
  const downloadId = await chrome.downloads.download({
    url: `data:${entry.mimeType};base64,${entry.base64}`,
    filename: fileName,
    conflictAction: 'uniquify',
    saveAs: false,
  });

  return { downloadId, fileName };
}

async function findAbrsTabForSlot(
  slot: AbrsCoupangLedgerDownloadSlot,
): Promise<chrome.tabs.Tab | null> {
  const activeTab = await getCurrentActiveTab();

  if (activeTab?.id && isTabUsableForAbrsSlot(activeTab, slot)) {
    return activeTab;
  }

  const tabs = await chrome.tabs.query({});

  return tabs.find((tab) => tab.id && isTabUsableForAbrsSlot(tab, slot)) ?? null;
}

async function waitForTabReady(tabId: number): Promise<void> {
  const currentTab = await chrome.tabs.get(tabId);

  if (currentTab.status === 'complete') {
    return;
  }

  await Promise.race([
    new Promise<void>((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo,
      ) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
          return;
        }

        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };

      chrome.tabs.onUpdated.addListener(listener);
    }),
    delay(8_000),
  ]);
}

async function prepareAbrsTab(tab: chrome.tabs.Tab): Promise<chrome.tabs.Tab> {
  if (!tab.id) {
    return tab;
  }

  await waitForTabReady(tab.id);
  await delay(1_000);

  return chrome.tabs.get(tab.id);
}

async function waitForStableAbrsTab(tabId: number): Promise<chrome.tabs.Tab> {
  let previousUrl: string | undefined;
  let stableCount = 0;
  let latestTab = await chrome.tabs.get(tabId);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    latestTab = await chrome.tabs.get(tabId);

    if (latestTab.status === 'complete' && latestTab.url === previousUrl) {
      stableCount += 1;
    } else {
      stableCount = 0;
      previousUrl = latestTab.url;
    }

    if (stableCount >= 2) {
      return latestTab;
    }

    await delay(500);
  }

  return latestTab;
}

async function waitForTabNavigation(tabId: number): Promise<chrome.tabs.Tab> {
  await Promise.race([
    new Promise<void>((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo,
        tab: chrome.tabs.Tab,
      ) => {
        if (updatedTabId !== tabId) {
          return;
        }

        const url = tab.url ?? changeInfo.url ?? '';

        if (
          changeInfo.status === 'complete' ||
          url.includes('wing.coupang.com') ||
          url.includes('advertising.coupang.com') ||
          url.includes('ads.coupang.com')
        ) {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    }),
    delay(10_000),
  ]);

  return chrome.tabs.get(tabId);
}

async function clickCoupangAuthLoginButton(tabId: number): Promise<boolean> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const normalizeText = (value: string | null | undefined) =>
        value?.replace(/\s+/g, ' ').trim() ?? '';
      const isVisible = (element: HTMLElement) => element.offsetParent !== null;
      const visibleInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="email"], input[type="text"], input[type="password"], input[name*="user" i], input[name*="id" i], input[name*="password" i]',
        ),
      ).filter(isVisible);
      const hasCredentialForm = visibleInputs.some(
        (element) =>
          element.type === 'password' ||
          /password/i.test(element.name) ||
          /password/i.test(element.id),
      );

      if (hasCredentialForm) {
        return false;
      }

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, input[type="button"], input[type="submit"], a, [role="button"]',
        ),
      );
      const loginButton = candidates.find((element) => {
        if (!isVisible(element)) {
          return false;
        }

        const text = normalizeText(element.textContent);
        const value = normalizeText(
          element instanceof HTMLInputElement ? element.value : null,
        );
        const ariaLabel = normalizeText(element.getAttribute('aria-label'));
        const title = normalizeText(element.getAttribute('title'));

        return [text, value, ariaLabel, title].some(
          (candidate) => candidate === '로그인' || candidate.includes('로그인'),
        );
      });

      loginButton?.click();

      return Boolean(loginButton);
    },
  });

  return Boolean(result?.result);
}

async function resolveCoupangAuthRedirect(
  tab: chrome.tabs.Tab,
  slot: AbrsCoupangLedgerDownloadSlot,
): Promise<chrome.tabs.Tab> {
  if (!tab.id) {
    return tab;
  }

  if (slot === 'dailySettlement' && isAdsLoginTab(tab)) {
    const clicked = await clickCoupangAuthLoginButton(tab.id);

    if (!clicked) {
      throw new Error(
        'Coupang 광고센터 로그인 화면에서 로그인하기 버튼을 찾지 못했습니다. 열린 광고센터 탭에서 로그인한 뒤 다시 시도해주세요.',
      );
    }

    const nextTab = await waitForTabNavigation(tab.id);

    if (isAdsLoginTab(nextTab)) {
      throw new Error(
        'Coupang 광고센터 로그인 버튼을 눌렀지만 광고센터로 이동하지 않았습니다. 열린 탭에서 로그인 상태를 확인한 뒤 다시 시도해주세요.',
      );
    }

    return resolveCoupangAuthRedirect(nextTab, slot);
  }

  if (!isCoupangAuthTabForSlot(tab, slot)) {
    return tab;
  }

  throw new Error(COUPANG_DIRECT_LOGIN_REQUIRED_MESSAGE);
}

async function getOrOpenAbrsTabForSlot(
  slot: AbrsCoupangLedgerDownloadSlot,
): Promise<chrome.tabs.Tab> {
  const existingTab = await findAbrsTabForSlot(slot);

  if (existingTab?.id) {
    const preparedTab = await prepareAbrsTab(existingTab);
    if (!preparedTab.id) {
      return resolveCoupangAuthRedirect(preparedTab, slot);
    }
    const stableTab = await waitForStableAbrsTab(preparedTab.id);

    return resolveCoupangAuthRedirect(stableTab, slot);
  }

  const createdTab = await chrome.tabs.create({
    active: false,
    url: getAbrsSlotStartUrl(slot),
  });

  if (!createdTab.id) {
    throw new Error('Coupang 탭을 열지 못했습니다.');
  }

  const preparedTab = await prepareAbrsTab(createdTab);
  if (!preparedTab.id) {
    return resolveCoupangAuthRedirect(preparedTab, slot);
  }
  const stableTab = await waitForStableAbrsTab(preparedTab.id);

  return resolveCoupangAuthRedirect(stableTab, slot);
}

async function assertAbrsTabReadyForSlot(
  tab: chrome.tabs.Tab,
  slot: AbrsCoupangLedgerDownloadSlot,
): Promise<chrome.tabs.Tab> {
  if (!tab.id) {
    return tab;
  }

  const stableTab = await waitForStableAbrsTab(tab.id);

  if (slot === 'dailySettlement' && isAdsLoginTab(stableTab)) {
    throw new Error(COUPANG_ADS_LOGIN_REQUIRED_MESSAGE);
  }

  if (isCoupangAuthTabForSlot(stableTab, slot)) {
    throw new Error(COUPANG_DIRECT_LOGIN_REQUIRED_MESSAGE);
  }

  return stableTab;
}

async function downloadAbrsLedgerSlot(
  slot: AbrsCoupangLedgerDownloadSlot,
  targetDate: string,
): Promise<{
  download: AbrsCoupangLedgerDownload | null;
  status: AbrsLedgerDownloadSlotStatus;
}> {
  let tab: chrome.tabs.Tab | null = null;

  try {
    tab = await getOrOpenAbrsTabForSlot(slot);

    if (!tab.id) {
      throw new Error('Coupang 탭 ID를 찾지 못했습니다.');
    }

    tab = await assertAbrsTabReadyForSlot(tab, slot);

    if (!tab.id) {
      throw new Error('Coupang 탭 ID를 찾지 못했습니다.');
    }

    const download = await sendTabMessageWithRecovery(tab.id, {
      type: 'abrs/download-ledger-file',
      payload: { slot, targetDate },
    });

    return {
      download,
      status: {
        slot,
        status: 'downloaded',
        fileName: download.fileName,
        tabUrl: tab.url,
      },
    };
  } catch (error) {
    return {
      download: null,
      status: {
        slot,
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'Coupang 파일을 가져오지 못했습니다.',
        tabUrl: tab?.url,
      },
    };
  }
}

async function handleDownloadAllAbrsLedgerFiles(
  payload: RuntimeMessageMap['abrs/download-all-ledger-files']['request'],
): Promise<RuntimeMessageMap['abrs/download-all-ledger-files']['response']> {
  const currentBatch = await getStoredAbrsLedgerBatch(payload.targetDate);
  const downloads: AbrsCoupangLedgerDownload[] = [];
  const statuses: AbrsLedgerDownloadSlotStatus[] = [];

  for (const slot of ABRS_LEDGER_DOWNLOAD_SLOTS) {
    const result = await downloadAbrsLedgerSlot(slot, payload.targetDate);

    statuses.push(result.status);

    if (result.download) {
      downloads.push(result.download);
    }
  }

  const entries = upsertAbrsLedgerPersistedDownloads({
    existingEntries: currentBatch.entries,
    downloads,
  });
  const batch =
    downloads.length > 0
      ? await setStoredAbrsLedgerBatch({
          targetDate: payload.targetDate,
          updatedAt: currentBatch.updatedAt,
          entries,
        })
      : currentBatch;

  return {
    batch,
    statuses,
  };
}

async function handleRuntimeMessage(
  message: RuntimeMessage,
): Promise<
  | RuntimeMessageMap['system/get-extension-context']['response']
  | RuntimeMessageMap['page/get-active-tab-popular-search-data']['response']
  | RuntimeMessageMap['page/set-active-tab-overlay']['response']
  | RuntimeMessageMap['abrs/get-active-tab-coupang-page']['response']
  | RuntimeMessageMap['abrs/download-active-tab-ledger-file']['response']
  | RuntimeMessageMap['abrs/get-ledger-batch']['response']
  | RuntimeMessageMap['abrs/save-ledger-batch-files']['response']
  | RuntimeMessageMap['abrs/clear-ledger-batch']['response']
  | RuntimeMessageMap['abrs/download-all-ledger-files']['response']
  | RuntimeMessageMap['abrs/download-cached-ledger-file']['response']
  | RuntimeMessageMap['abrs/get-ledger-target-date']['response']
  | RuntimeMessageMap['abrs/save-ledger-target-date']['response']
> {
  switch (message.type) {
    case 'system/get-extension-context':
      return handleGetExtensionContext();

    case 'page/get-active-tab-popular-search-data':
      return handleGetActiveTabPopularSearchData();

    case 'page/set-active-tab-overlay':
      if (!message.payload) {
        throw new Error('Missing payload for page/set-active-tab-overlay.');
      }

      return handleSetActiveTabOverlay(
        (message as RuntimeMessage<'page/set-active-tab-overlay'>).payload.enabled,
      );

    case 'abrs/get-active-tab-coupang-page':
      return handleGetActiveTabAbrsCoupangPage();

    case 'abrs/download-active-tab-ledger-file':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/download-active-tab-ledger-file.');
      }

      return handleDownloadActiveTabAbrsLedgerFile(
        (message as RuntimeMessage<'abrs/download-active-tab-ledger-file'>).payload,
      );

    case 'abrs/get-ledger-batch':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/get-ledger-batch.');
      }

      return handleGetAbrsLedgerBatch(
        (message as RuntimeMessage<'abrs/get-ledger-batch'>).payload,
      );

    case 'abrs/save-ledger-batch-files':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/save-ledger-batch-files.');
      }

      return handleSaveAbrsLedgerBatchFiles(
        (message as RuntimeMessage<'abrs/save-ledger-batch-files'>).payload,
      );

    case 'abrs/clear-ledger-batch':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/clear-ledger-batch.');
      }

      return handleClearAbrsLedgerBatch(
        (message as RuntimeMessage<'abrs/clear-ledger-batch'>).payload,
      );

    case 'abrs/download-all-ledger-files':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/download-all-ledger-files.');
      }

      return handleDownloadAllAbrsLedgerFiles(
        (message as RuntimeMessage<'abrs/download-all-ledger-files'>).payload,
      );

    case 'abrs/download-cached-ledger-file':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/download-cached-ledger-file.');
      }

      return handleDownloadCachedAbrsLedgerFile(
        (message as RuntimeMessage<'abrs/download-cached-ledger-file'>).payload,
      );

    case 'abrs/get-ledger-target-date':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/get-ledger-target-date.');
      }

      return getStoredAbrsLedgerTargetDate(
        (message as RuntimeMessage<'abrs/get-ledger-target-date'>).payload
          .fallbackDate,
      );

    case 'abrs/save-ledger-target-date':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/save-ledger-target-date.');
      }

      return setStoredAbrsLedgerTargetDate(
        (message as RuntimeMessage<'abrs/save-ledger-target-date'>).payload
          .targetDate,
      );

    default:
      throw new Error(`Unsupported runtime message: ${String(message)}`);
  }
}

export function registerRuntimeMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleRuntimeMessage(message as RuntimeMessage)
      .then((response) => {
        sendResponse(messageSuccess(response));
      })
      .catch((error) => {
        sendResponse(messageFailure(error));
      });

    return true;
  });
}
