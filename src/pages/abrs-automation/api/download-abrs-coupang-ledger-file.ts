import {
  sendRuntimeMessage,
  sendTabMessage,
  type AbrsCoupangLedgerDownloadSlot,
  type AbrsCoupangLedgerDownloadRequest,
  normalizeAbrsCoupangDownloads,
} from '@/shared/extension';
import { getAbrsWingSeller } from './abrs-ledger-batch-runtime';
import { resolveAbrsLedgerSellerId } from '../model/abrs-ledger-seller';
import { createFileFromAbrsCoupangDownload, isAbrsLedgerXlsxPayload } from './abrs-coupang-download-file';

function supportsSlot(urlValue: string | undefined, slot: AbrsCoupangLedgerDownloadSlot) {
  if (!urlValue) {
    return false;
  }

  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();

    return slot === 'dailySettlement' || slot === 'adPerformance'
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

export async function downloadAbrsCoupangLedgerFileFromActiveTab(params: AbrsCoupangLedgerDownloadRequest): Promise<File[]> {
  params = { ...params, expectedSellerId: params.expectedSellerId ?? (await getAbrsWingSeller()).sellerId };
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

  const originals = normalizeAbrsCoupangDownloads(download);
  resolveAbrsLedgerSellerId(originals, params.expectedSellerId);
  if (originals.some((original) => original.sellerId !== params.expectedSellerId)) {
    throw new Error('원본의 쿠팡 판매자 세션을 확인하지 못했습니다. 확장을 다시 로드하고 Wing·광고센터를 새로고침해 주세요.');
  }
  return originals.map((original) => {
    if (original.slot !== params.slot || !isAbrsLedgerXlsxPayload(original)) {
      throw new Error('쿠팡에서 받은 파일이 요청한 Excel 원본이 아닙니다. 다시 가져와 주세요.');
    }
    return createFileFromAbrsCoupangDownload(original);
  });
}
