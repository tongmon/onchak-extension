import type {
  AbrsCoupangLedgerDownloadRequest,
  AbrsCoupangLedgerDownloadSlot,
  AbrsLedgerBatch,
  AbrsLedgerDownloadSlotStatus,
} from '../../../shared/extension/messaging/contracts.ts';
import { resolveAbrsLedgerPeriod } from '../../../shared/extension/messaging/contracts.ts';
import { isAbrsLedgerXlsxPayload } from '../api/abrs-coupang-download-file.ts';
import { ABRS_REQUIRED_LEDGER_SLOTS, abrsLedgerEntryIdentity, classifyAbrsLedgerFile, getAbrsRequiredLedgerSlots, isAbrsLedgerSlotPeriodComplete } from './abrs-ledger-files.ts';
import { resolveAbrsLedgerSellerId } from './abrs-ledger-seller.ts';

export const ABRS_LEDGER_BATCH_DOWNLOAD_SLOTS: AbrsCoupangLedgerDownloadSlot[] = [...ABRS_REQUIRED_LEDGER_SLOTS];

export interface AbrsLedgerBatchProgress {
  batch: AbrsLedgerBatch;
  completedCount: number;
  totalCount: number;
  status: AbrsLedgerDownloadSlotStatus;
}
export interface AbrsLedgerBatchDownloadResult {
  batch: AbrsLedgerBatch;
  statuses: AbrsLedgerDownloadSlotStatus[];
}
interface DownloadAbrsLedgerBatchWithProgressInput {
  targetDate: string;
  periodStart?: string;
  periodEnd?: string;
  initialBatch: AbrsLedgerBatch;
  expectedSellerId?: string;
  downloadSlot: (params: AbrsCoupangLedgerDownloadRequest) => Promise<File | File[]>;
  persistSlot?: (file: File, slot: AbrsCoupangLedgerDownloadSlot) => Promise<AbrsLedgerBatch>;
  persistFiles?: (files: File[], slot: AbrsCoupangLedgerDownloadSlot) => Promise<AbrsLedgerBatch>;
  onProgress?: (progress: AbrsLedgerBatchProgress) => void;
  maxAttempts?: number;
}

function mayRetry(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !isAuthenticationOrAccessDenied(error)
    && !/자료가 없|파일이 없|보고서가 없|생성되지|지원하지|기간|계정이 변경|No report|no data/i.test(message);
}

function isAuthenticationOrAccessDenied(error: unknown): boolean {
  const status = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined;
  if (status === 401 || status === 403) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /(?:HTTP\s*[:=]?\s*|실패:\s*)(?:401|403)\b|로그인|권한|접근\s*(?:제한|거부)|인증\s*(?:안내|화면|토큰|오류|실패|세션)|인증\/오류|access denied|\bunauthorized\b|\bforbidden\b|session expired|login (?:redirect|page|required)/i.test(message);
}

function downloadSite(slot: AbrsCoupangLedgerDownloadSlot): 'Wing' | '광고센터' {
  return slot === 'adPerformance' || slot === 'dailySettlement' ? '광고센터' : 'Wing';
}

export async function downloadAbrsLedgerBatchWithProgress({
  targetDate, periodStart, periodEnd, initialBatch, expectedSellerId, downloadSlot, persistSlot, persistFiles, onProgress, maxAttempts = 2,
}: DownloadAbrsLedgerBatchWithProgressInput): Promise<AbrsLedgerBatchDownloadResult> {
  let batch = initialBatch;
  resolveAbrsLedgerSellerId(initialBatch.entries, expectedSellerId);
  const statuses: AbrsLedgerDownloadSlotStatus[] = [];
  const deniedSites = new Set<ReturnType<typeof downloadSite>>();
  const period = resolveAbrsLedgerPeriod({ targetDate, periodStart, periodEnd });
  const slots = getAbrsRequiredLedgerSlots(period);
  const samePeriod = initialBatch.targetDate === targetDate
    && (initialBatch.periodStart ?? initialBatch.targetDate) === period.start
    && (initialBatch.periodEnd ?? initialBatch.targetDate) === period.end;
  for (const slot of slots) {
    const cachedFiles = samePeriod ? initialBatch.entries.filter((entry) => {
      if (entry.slot !== slot || entry.collectionVersion !== 2 || entry.size <= 0 || !isAbrsLedgerXlsxPayload(entry, entry.size)) return false;
      if (expectedSellerId && entry.sellerId !== expectedSellerId) return false;
      const classification = classifyAbrsLedgerFile(entry.fileName);
      if (classification?.slot !== slot || classification.sourceType !== entry.sourceType) return false;
      if (classification.dateRange && (entry.dateRange?.start !== classification.dateRange.start
        || entry.dateRange?.end !== classification.dateRange.end)) return false;
      return true;
    }) : [];
    if (isAbrsLedgerSlotPeriodComplete(cachedFiles, slot, period)) {
      const status: AbrsLedgerDownloadSlotStatus = {
        slot, status: 'downloaded', fileName: cachedFiles.map((entry) => entry.fileName).join(', '),
      };
      statuses.push(status);
      onProgress?.({ batch, completedCount: statuses.filter((item) => item.status === 'downloaded').length,
        totalCount: slots.length, status });
      continue;
    }
    const site = downloadSite(slot);
    if (deniedSites.has(site)) {
      const status: AbrsLedgerDownloadSlotStatus = { slot, status: 'failed',
        error: `쿠팡 ${site} 인증 또는 접근 거부가 확인되어 이 파일은 요청하지 않았습니다. 해당 사이트에서 로그인 및 접근 상태를 확인해주세요.` };
      statuses.push(status);
      onProgress?.({ batch, completedCount: statuses.filter((item) => item.status === 'downloaded').length,
        totalCount: slots.length, status });
      continue;
    }
    let status: AbrsLedgerDownloadSlotStatus = { slot, status: 'failed', error: '파일을 가져오지 못했습니다.' };
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      try {
        const downloaded = await downloadSlot({ slot, targetDate, periodStart, periodEnd, ...(expectedSellerId ? { expectedSellerId } : {}) });
        const files = Array.isArray(downloaded) ? downloaded : [downloaded];
        if (files.length === 0) throw new Error('조회 기간에 생성된 보고서가 없습니다.');
        const identities = files.map((file) => abrsLedgerEntryIdentity(slot, file.name));
        if (new Set(identities).size !== files.length) {
          throw new Error('서로 다른 원본의 파일명이 중복되어 저장을 중단했습니다. 기존 파일은 보관되어 있습니다. 쿠팡 다운로드 목록을 확인해 주세요.');
        }
        if (persistFiles) batch = await persistFiles(files, slot);
        else if (persistSlot && files.length === 1) batch = await persistSlot(files[0], slot);
        else throw new Error('여러 원본을 한 세트로 보관할 수 없습니다. 확장 프로그램을 다시 열어주세요.');
        status = { slot, status: 'downloaded', fileName: files.map((file) => file.name).join(', ') };
        break;
      } catch (error) {
        status = { slot, status: 'failed', error: error instanceof Error ? error.message : 'Coupang 파일을 가져오지 못했습니다.' };
        if (isAuthenticationOrAccessDenied(error)) {
          deniedSites.add(site);
          break;
        }
        if (!mayRetry(error)) break;
      }
    }
    statuses.push(status);
    onProgress?.({ batch, completedCount: statuses.filter((item) => item.status === 'downloaded').length,
      totalCount: slots.length, status });
  }
  return { batch, statuses };
}
