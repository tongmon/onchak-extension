import { scopedStorageKey } from "../../../shared/extension/storage/account-scope.ts";
import type { PopupMarginCalculationResult } from "./popup-margin-result.ts";
const KEY = "pendingMarginResult";
export async function savePendingMarginResult(
  result: PopupMarginCalculationResult | null,
) {
  const key = await scopedStorageKey(KEY);
  if (result) await chrome.storage.local.set({ [key]: result });
  else await chrome.storage.local.remove(key);
}
export async function loadPendingMarginResult(): Promise<PopupMarginCalculationResult | null> {
  const key = await scopedStorageKey(KEY);
  const stored = (await chrome.storage.local.get(key))[key] as
    | PopupMarginCalculationResult
    | undefined;
  return stored?.schemaVersion === 2 &&
    stored.clientResultId &&
    stored.capturedAt
    ? stored
    : null;
}
