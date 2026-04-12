import {
  extensionStorage,
  getCurrentActiveTab,
  messageFailure,
  messageSuccess,
  sendTabMessage,
  type ActiveTabSnapshot,
  type RuntimeMessage,
  type RuntimeMessageMap,
} from '@/shared/extension';

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
    const domSnapshot = await sendTabMessage(activeTab.id, {
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
    await sendTabMessage(activeTab.id, {
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
  | RuntimeMessageMap['page/set-active-tab-overlay']['response']
> {
  switch (message.type) {
    case 'system/get-extension-context':
      return handleGetExtensionContext();

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
