import { scopedStorageKey } from "../../../shared/extension/storage/account-scope";
import { useMutation } from "@tanstack/react-query";
import {
  authenticatedFetch,
  readSuccessJson,
  requireRemoteSession,
} from "@/entities/auth";
import {
  abrsLedgerImportPath,
  buildAbrsLedgerImportFormData,
} from "./abrs-ledger-import-request";
import {
  createAbrsLedgerBatchName,
  validateAbrsLedgerFiles,
  type AbrsLedgerFileEntry,
} from "../model/abrs-ledger-files";

export interface UploadAbrsLedgerImportMutationVariables {
  targetDate: string;
  entries: AbrsLedgerFileEntry[];
}
export interface UploadAbrsLedgerImportMutationResult {
  batchName: string;
  response: Record<string, unknown>;
  url: string;
  reviewUrl: string;
  workflow: Record<string, unknown> | null;
}
export async function uploadAbrsLedgerImport({
  targetDate,
  entries,
}: UploadAbrsLedgerImportMutationVariables): Promise<UploadAbrsLedgerImportMutationResult> {
  const validation = validateAbrsLedgerFiles(entries, targetDate);
  if (!validation.ok) throw new Error(validation.messages.join("\n"));
  const { config, session } = await requireRemoteSession();
  const batchName = createAbrsLedgerBatchName(targetDate);
  const batchKey = await scopedStorageKey(`abrsLedgerBatch:${targetDate}`);
  const receiptKey = await scopedStorageKey(`abrsReceipt:${targetDate}`);
  const fingerprints = await Promise.all(
    entries.map(async (entry) => {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        await entry.file.arrayBuffer(),
      );
      return `${entry.slot}:${entry.file.name}:${Array.from(
        new Uint8Array(hash),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;
    }),
  );
  const fingerprint = fingerprints.sort().join("|");
  const receipt = (await chrome.storage.local.get(receiptKey))[receiptKey] as
    | { fingerprint: string; response: Record<string, unknown> }
    | undefined;
  const hasPendingBatch = !!(await chrome.storage.local.get(batchKey))[batchKey];
  const response =
    !hasPendingBatch && receipt?.fingerprint === fingerprint
      ? receipt.response
      : await readSuccessJson(
          await authenticatedFetch(
            abrsLedgerImportPath,
            {
              method: "POST",
              body: buildAbrsLedgerImportFormData({
                targetDate,
                batchName,
                entries,
              }),
            },
            120000,
            session.accessToken,
          ),
        );
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
  await chrome.storage.local.set({ [receiptKey]: { fingerprint, response } });
  await chrome.storage.local.remove(batchKey);
  let workflow: Record<string, unknown> | null = null;
  // Reception is already confirmed. A failed follow-up must not encourage another upload.
  try {
    workflow = await readSuccessJson(
      await authenticatedFetch(
        `/api/ledger/imports/${encodeURIComponent(response.importId)}/workflow`,
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
    url: `${config.apiBaseUrl}${abrsLedgerImportPath}`,
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
