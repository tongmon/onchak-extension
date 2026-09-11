import { scopedStorageKey } from "../../../shared/extension/storage/account-scope";
import { useMutation } from "@tanstack/react-query";
import {
  authenticatedFetch,
  readSuccessJson,
  requireRemoteSession,
} from "@/entities/auth";
import type { PopupMarginCalculationResult } from "../model/popup-margin-result";

export const popupMarginResultUploadPath = "/api/margin-results";
export interface UploadPopupMarginResultRequest {
  capturedAt: string;
  result: PopupMarginCalculationResult;
  source: "onchak-extension-popup";
}
export interface UploadPopupMarginResultMutationVariables {
  result: PopupMarginCalculationResult;
}
export interface UploadPopupMarginResultMutationResult {
  request: UploadPopupMarginResultRequest;
  response: unknown;
  url: string;
}

export async function uploadPopupMarginResult({
  result,
}: UploadPopupMarginResultMutationVariables): Promise<UploadPopupMarginResultMutationResult> {
  const { config, session } = await requireRemoteSession();
  const pendingKey = await scopedStorageKey("pendingMarginResult");
  const request: UploadPopupMarginResultRequest = {
    capturedAt: result.capturedAt,
    result,
    source: "onchak-extension-popup",
  };
  const response = await readSuccessJson(
    await authenticatedFetch(
      popupMarginResultUploadPath,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      30000,
      session.accessToken,
    ),
  );
  if (
    response.status !== "RECEIVED" ||
    typeof response.id !== "string" ||
    !response.id
  ) {
    throw new Error(
      "서버의 저장 완료 응답을 확인하지 못했습니다. 같은 결과로 다시 시도할 수 있습니다.",
    );
  }
  await chrome.storage.local.remove(pendingKey);
  return {
    request,
    response,
    url: `${config.apiBaseUrl}${popupMarginResultUploadPath}`,
  };
}

export function useUploadPopupMarginResultMutation() {
  return useMutation({
    mutationKey: ["popup-home", "margin-result", "upload"],
    networkMode: "always",
    retry: false,
    mutationFn: uploadPopupMarginResult,
  });
}
