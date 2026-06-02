import { useMutation } from '@tanstack/react-query';
import { authStorage } from '@/entities/auth';
import type { PopupMarginCalculationResult } from '../model/popup-margin-result';

export const popupMarginResultUploadPath = '/api/margin-results';

export interface UploadPopupMarginResultRequest {
  capturedAt: string;
  result: PopupMarginCalculationResult;
  source: 'onchak-extension-popup';
}

export interface UploadPopupMarginResultMutationVariables {
  result: PopupMarginCalculationResult;
}

export interface UploadPopupMarginResultMutationResult {
  request: UploadPopupMarginResultRequest;
  response: unknown;
  url: string;
}

const MISSING_LOGIN_SESSION_MESSAGE =
  '\uB85C\uADF8\uC778 \uC138\uC158\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD55C \uB4A4 \uC5C5\uB85C\uB4DC\uD574\uC8FC\uC138\uC694.';

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
}

async function parseResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedRecord(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  return getRecord(record?.[key]);
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  const record = getRecord(payload);

  if (!record) {
    return fallback;
  }

  const candidates = [
    record.message,
    record.error,
    getNestedRecord(record, 'data')?.message,
    getNestedRecord(record, 'data')?.error,
  ];

  const firstMessage = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );

  return firstMessage ?? fallback;
}

async function uploadPopupMarginResult({
  result,
}: UploadPopupMarginResultMutationVariables): Promise<UploadPopupMarginResultMutationResult> {
  const [config, session] = await Promise.all([
    authStorage.getConfig(),
    authStorage.getSession(),
  ]);

  if (!session) {
    throw new Error(MISSING_LOGIN_SESSION_MESSAGE);
  }

  const url = buildUrl(config.apiBaseUrl, popupMarginResultUploadPath);
  const request: UploadPopupMarginResultRequest = {
    capturedAt: new Date().toISOString(),
    result,
    source: 'onchak-extension-popup',
  };
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(session.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}),
    },
    body: JSON.stringify(request),
  });
  const responsePayload = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        responsePayload,
        `Margin result upload failed with status ${response.status}.`,
      ),
    );
  }

  return {
    request,
    response: responsePayload,
    url,
  };
}

export function useUploadPopupMarginResultMutation() {
  return useMutation({
    mutationKey: ['popup-home', 'margin-result', 'upload'],
    networkMode: 'always',
    mutationFn: uploadPopupMarginResult,
  });
}
