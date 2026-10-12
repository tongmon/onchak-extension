import {
  extensionStorage,
  messageFailure,
  messageSuccess,
  type TabMessage,
  type TabMessageMap,
  normalizeAbrsCoupangDownloads,
} from '@/shared/extension';
import { stampAbrsCoupangDownloads } from '../../../pages/abrs-automation/model/abrs-ledger-seller';
import {
  getDomSnapshot,
  getOverlayEnabled,
  setOverlayVisibility,
} from './overlay';
import {
  downloadAbrsCoupangLedgerFile,
  getAbrsCoupangPageSnapshot,
} from './abrs-coupang-page';
import { collectCoupangReports } from './abrs-coupang-reports';
import { extractPopularSearchSnapshot } from './popular-search-parser';

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
  | TabMessageMap['abrs/get-coupang-page']['response']
  | TabMessageMap['abrs/download-ledger-file']['response']
> {
  switch (message.type) {
    case 'page/get-dom-snapshot':
      return getDomSnapshot();

    case 'page/get-popular-search-data':
      return extractPopularSearchSnapshot();

    case 'page/set-overlay':
      if (!message.payload) {
        throw new Error('Missing payload for page/set-overlay.');
      }

      setOverlayVisibility((message as TabMessage<'page/set-overlay'>).payload.enabled);
      return { overlayEnabled: getOverlayEnabled() };

    case 'abrs/get-coupang-page':
      return getAbrsCoupangPageSnapshot();

    case 'abrs/download-ledger-file':
      if (!message.payload) {
        throw new Error('Missing payload for abrs/download-ledger-file.');
      }

      {
        const request = (message as TabMessage<'abrs/download-ledger-file'>).payload;
        const wing = window.location.hostname === 'wing.coupang.com';
        const before = getAbrsCoupangPageSnapshot().sellerId;
        if (wing && (!before || request.expectedSellerId && before !== request.expectedSellerId)) {
          throw new Error('현재 Wing 판매자가 선택한 판매자와 다르거나 확인되지 않습니다. 같은 판매자로 로그인 후 새로고침해 주세요.');
        }
        let result;
        if (
          ['inventoryHealth', 'salesStatistics', 'dailySettlement', 'productList'].includes(request.slot)
        ) {
          result = await downloadAbrsCoupangLedgerFile(request);
        } else {
          result = await collectCoupangReports(request);
        }
        const downloads = stampAbrsCoupangDownloads(normalizeAbrsCoupangDownloads(result),
          request.expectedSellerId, before, getAbrsCoupangPageSnapshot().sellerId, wing);
        return downloads.length === 1 ? downloads[0] : downloads;
      }

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
