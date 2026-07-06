import {
  sendRuntimeMessage,
  type AbrsCoupangLedgerDownloadSlot,
} from '@/shared/extension';
import { createFileFromAbrsCoupangDownload } from './abrs-coupang-download-file';

export async function downloadAbrsCoupangLedgerFileFromActiveTab(params: {
  slot: AbrsCoupangLedgerDownloadSlot;
  targetDate: string;
}): Promise<File> {
  const download = await sendRuntimeMessage({
    type: 'abrs/download-active-tab-ledger-file',
    payload: params,
  });

  return createFileFromAbrsCoupangDownload(download);
}
