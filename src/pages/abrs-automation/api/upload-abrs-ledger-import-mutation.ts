import { accountScope } from "../../../shared/extension/storage/account-scope";
import { useMutation } from "@tanstack/react-query";
import {
  authenticatedFetch,
  readSuccessJson,
  requireRemoteSession,
} from "@/entities/auth";
import {
  abrsLedgerImportPath,
  abrsLedgerPeriodImportPath,
  buildAbrsLedgerPeriodFormData,
  assertAbrsLedgerPeriodReceipt,
} from "./abrs-ledger-import-request";
import {
  createAbrsLedgerBatchName,
  getAbrsRequiredLedgerSlots,
  validateAbrsLedgerFiles,
  type AbrsLedgerFileEntry,
  type AbrsLedgerDateRange,
} from "../model/abrs-ledger-files";

import { clearAbrsLedgerBatch } from "./abrs-ledger-batch-runtime";
import { assertAbrsLedgerPreflightCanUpload } from "../model/abrs-ledger-preflight";
import { createAbrsLedgerOriginalSignatures, restoreAbrsLedgerEntries } from "../model/abrs-ledger-batch-cache";
import { resolveAbrsLedgerSellerId } from '../model/abrs-ledger-seller';

export interface UploadAbrsLedgerImportMutationVariables {
  targetDate: string;
  entries: AbrsLedgerFileEntry[];
  period?: AbrsLedgerDateRange;
  uploadMode?: 'daily' | 'monthly';
}
export interface UploadAbrsLedgerImportMutationResult {
  batchName: string;
  response: Record<string, unknown>;
  url: string;
  reviewUrl: string;
  workflow: Record<string, unknown> | null;
  importCount: number;
  remainingEntries: AbrsLedgerFileEntry[] | null;
}
export async function uploadAbrsLedgerImport({
  targetDate,
  entries,
  period,
  uploadMode,
}: UploadAbrsLedgerImportMutationVariables): Promise<UploadAbrsLedgerImportMutationResult> {
  const selectedPeriod = period ?? { start: targetDate, end: targetDate };
  const selectedMode = uploadMode ?? (selectedPeriod.start === selectedPeriod.end ? 'daily' : 'monthly');
  const selectedEntries = entries.filter((entry) => getAbrsRequiredLedgerSlots(selectedPeriod).includes(entry.slot));
  const selectedSellerId = resolveAbrsLedgerSellerId(selectedEntries);
  const validation = validateAbrsLedgerFiles(selectedEntries, targetDate, selectedPeriod);
  if (!validation.ok) throw new Error(validation.messages.join("\n"));
  const { config, session } = await requireRemoteSession();
  const expectedAccountScope = accountScope({ authConfig: config, authSession: session });
  if (!expectedAccountScope) throw new Error("로그인 계정을 확인할 수 없습니다. 다시 로그인해 주세요.");
  const expectedOriginals = await createAbrsLedgerOriginalSignatures(selectedEntries);
  const batchName = createAbrsLedgerBatchName(targetDate);
  const buildPayload = () => buildAbrsLedgerPeriodFormData({ targetDate, batchName, entries: selectedEntries,
    period: selectedPeriod, uploadMode: selectedMode, selectedSellerId });
  // A local receipt cannot prove that another period has not replaced these dates.
  // Every submission is checked against the current server state.
  const preflightResponse = await authenticatedFetch(`${abrsLedgerPeriodImportPath}/preflight`,
    { method: "POST", body: buildPayload() }, 120000, session.accessToken);
  if (preflightResponse.status === 404 || preflightResponse.status === 405) {
    throw new Error('서버가 새 일별·월별 업로드를 아직 지원하지 않습니다. 서버 업데이트 후 다시 전송해 주세요. 파일은 보관되어 있습니다.');
  }
  assertAbrsLedgerPreflightCanUpload(await readSuccessJson(preflightResponse));
  const response = await readSuccessJson(await authenticatedFetch(abrsLedgerPeriodImportPath,
    { method: "POST", body: buildPayload() }, 120000, session.accessToken));
  const importCount = assertAbrsLedgerPeriodReceipt(response, selectedPeriod, selectedMode);
  if (
    typeof response.importId !== "string" ||
    !response.importId ||
    typeof response.status !== "string" ||
    !response.status
  ) {
    throw new Error(
      "장부 접수 번호를 확인하지 못했습니다. 첨부 파일은 보관되어 있습니다. 웹에서 접수 여부를 확인해 주세요.",
    );
  }
  // The server receipt is durable before local workbook eviction.
  const remainingBatch = await clearAbrsLedgerBatch(targetDate, {
    periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end, expectedAccountScope, expectedOriginals,
  }).catch(() => null); // A confirmed server receipt remains authoritative even if cleanup fails.
  let remainingEntries: AbrsLedgerFileEntry[] | null = null;
  try {
    if (remainingBatch) remainingEntries = restoreAbrsLedgerEntries(remainingBatch.entries
      .filter((entry) => getAbrsRequiredLedgerSlots(selectedPeriod).includes(entry.slot)));
  } catch { /* A malformed retained cache cannot turn a confirmed upload into a failed write. */ }
  let workflow: Record<string, unknown> | null = null;
  // Reception is already confirmed. A failed follow-up must not encourage another upload.
  try {
    workflow = await readSuccessJson(
      await authenticatedFetch(
        `/api/ledger/imports/${encodeURIComponent(response.importId)}/workflow`,
        {}, 30000, session.accessToken,
      ),
    );
  } catch {
    /* web link remains available */
  }
  const query = new URLSearchParams({
    date: targetDate,
    importId: response.importId,
  });
  return {
    batchName,
    response,
    workflow,
    url: `${config.apiBaseUrl}${abrsLedgerPeriodImportPath}`,
    importCount,
    remainingEntries,
    reviewUrl: `${config.apiBaseUrl === "http://localhost:8080" ? "http://localhost:5173" : config.apiBaseUrl}/app/ledger-writing?${query}`,
  };
}
export function useUploadAbrsLedgerImportMutation() {
  return useMutation({
    mutationKey: ["abrs", "ledger-import", "upload"],
    networkMode: "always",
    retry: false,
    mutationFn: uploadAbrsLedgerImport,
  });
}
