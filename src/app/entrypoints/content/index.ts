import {
  extensionStorage,
  messageFailure,
  messageSuccess,
  type TabMessage,
  type TabMessageMap,
} from '@/shared/extension';
import { getDomSnapshot, setOverlayVisibility } from './overlay';
import { extractPopularSearchSnapshot } from './popular-search-parser';

const DEBUG_CONTENT_BRIDGE = true;

function logContentBridgeDebug(
  stage: string,
  details: Record<string, unknown>,
): void {
  if (!DEBUG_CONTENT_BRIDGE) {
    return;
  }

  console.info(`[Onchak][content][${stage}]`, details);
}

async function syncOverlayFromStorage(): Promise<void> {
  await extensionStorage.ensureDefaults();
  const settings = await extensionStorage.get('settings');
  setOverlayVisibility(settings.pageOverlayEnabled);
}

async function handleTabMessage(
  message: TabMessage,
): Promise<
  | TabMessageMap['page/get-dom-snapshot']['response']
  | TabMessageMap['page/get-popular-search-data']['response']
  | TabMessageMap['page/set-overlay']['response']
> {
  switch (message.type) {
    case 'page/get-dom-snapshot':
      logContentBridgeDebug('message', {
        type: message.type,
        href: window.location.href,
      });
      return getDomSnapshot();

    case 'page/get-popular-search-data':
      logContentBridgeDebug('message', {
        type: message.type,
        href: window.location.href,
      });
      return extractPopularSearchSnapshot();

    case 'page/set-overlay':
      if (!message.payload) {
        throw new Error('Missing payload for page/set-overlay.');
      }

      logContentBridgeDebug('message', {
        type: message.type,
        href: window.location.href,
        enabled: message.payload.enabled,
      });

      setOverlayVisibility(message.payload.enabled);
      return { overlayEnabled: message.payload.enabled };

    default:
      throw new Error(`Unsupported tab message: ${String(message)}`);
  }
}

extensionStorage.subscribe((changes) => {
  if (changes.settings) {
    setOverlayVisibility(changes.settings.pageOverlayEnabled);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleTabMessage(message as TabMessage)
    .then((response) => {
      logContentBridgeDebug('response', {
        type: (message as TabMessage).type,
        ok: true,
      });
      sendResponse(messageSuccess(response));
    })
    .catch((error) => {
      logContentBridgeDebug('response', {
        type: (message as TabMessage).type,
        ok: false,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown content error.',
      });
      sendResponse(messageFailure(error));
    });

  return true;
});

void syncOverlayFromStorage();
