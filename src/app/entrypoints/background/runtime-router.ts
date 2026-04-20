import {
  extensionStorage,
  getCurrentActiveTab,
  messageFailure,
  messageSuccess,
  sendTabMessage,
  type ActiveTabSnapshot,
  type RuntimeMessage,
  type RuntimeMessageMap,
  type TabMessage,
  type TabMessageMap,
  type TabMessageType,
} from '@/shared/extension';

const CONTENT_SCRIPT_REFRESH_REQUIRED_MESSAGE =
  '현재 탭에 content script가 연결되지 않았습니다. 탭을 새로고침한 뒤 다시 시도해주세요.';

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

    return sendTabMessage(tabId, message);
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

async function handleRuntimeMessage(
  message: RuntimeMessage,
): Promise<
  | RuntimeMessageMap['system/get-extension-context']['response']
  | RuntimeMessageMap['page/get-active-tab-popular-search-data']['response']
  | RuntimeMessageMap['page/set-active-tab-overlay']['response']
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

      return handleSetActiveTabOverlay(message.payload.enabled);

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
