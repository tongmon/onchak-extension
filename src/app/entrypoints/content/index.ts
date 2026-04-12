import {
  extensionStorage,
  messageFailure,
  messageSuccess,
  type TabMessage,
  type TabMessageMap,
} from '@/shared/extension';
import { getDomSnapshot, setOverlayVisibility } from './overlay';

async function syncOverlayFromStorage(): Promise<void> {
  await extensionStorage.ensureDefaults();
  const settings = await extensionStorage.get('settings');
  setOverlayVisibility(settings.pageOverlayEnabled);
}

async function handleTabMessage(
  message: TabMessage,
): Promise<
  | TabMessageMap['page/get-dom-snapshot']['response']
  | TabMessageMap['page/set-overlay']['response']
> {
  switch (message.type) {
    case 'page/get-dom-snapshot':
      return getDomSnapshot();

    case 'page/set-overlay':
      if (!message.payload) {
        throw new Error('Missing payload for page/set-overlay.');
      }

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
      sendResponse(messageSuccess(response));
    })
    .catch((error) => {
      sendResponse(messageFailure(error));
    });

  return true;
});

void syncOverlayFromStorage();
