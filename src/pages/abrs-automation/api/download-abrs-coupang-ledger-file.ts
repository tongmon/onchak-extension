import {
  sendRuntimeMessage,
  sendTabMessage,
  type AbrsCoupangLedgerDownloadSlot,
} from '@/shared/extension';
import { createFileFromAbrsCoupangDownload } from './abrs-coupang-download-file';

function supportsSlot(urlValue: string | undefined, slot: AbrsCoupangLedgerDownloadSlot) {
  if (!urlValue) {
    return false;
  }

  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();

    return slot === 'dailySettlement'
      ? hostname === 'advertising.coupang.com' || hostname === 'ads.coupang.com'
      : hostname === 'wing.coupang.com';
  } catch {
    return false;
  }
}

function isMissingReceiverError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');

  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

export async function downloadAbrsCoupangLedgerFileFromActiveTab(params: {
  slot: AbrsCoupangLedgerDownloadSlot;
  targetDate: string;
}): Promise<File> {
  const tabs = await chrome.tabs.query({});
  const compatibleTab = tabs.find(
    (tab) => tab.id && supportsSlot(tab.url, params.slot),
  );
  let download;

  if (compatibleTab?.id) {
    try {
      download = await sendTabMessage(compatibleTab.id, {
        type: 'abrs/download-ledger-file',
        payload: params,
      });
    } catch (error) {
      if (!isMissingReceiverError(error)) {
        throw error;
      }

      download = undefined;
    }
  }

  download ??= await sendRuntimeMessage({
    type: 'abrs/download-active-tab-ledger-file',
    payload: params,
  });

  return createFileFromAbrsCoupangDownload(download);
}
