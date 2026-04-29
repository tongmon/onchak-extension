import { useMutation } from "@tanstack/react-query";
import type { AuthConfig, AuthSession } from "@/entities/auth";
import type { PopularSearchSnapshot } from "@/shared/extension";

const MARGIN_CALCULATION_PATH = "/api/margin-calculations";

export interface MarginCalculationRequestPayload extends PopularSearchSnapshot {
  "1688Url": string;
  salesCommission: number;
  coupangProductCost: number;
  inboundOutboundShippingFee: number;
  overseasShippingFee: number;
}

export interface MarginCalculationResponse {
  excelRate: number;
  excelEx: string;
  finalResult: number[];
  productionCost: number;
}

interface MarginCalculationVariables {
  authConfig: AuthConfig;
  authSession: AuthSession | null;
  payload: MarginCalculationRequestPayload;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString();
}

async function parseResponseJson(response: Response): Promise<unknown> {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const candidates = [
    payload.message,
    payload.error,
    isRecord(payload.data) ? payload.data.message : null,
    isRecord(payload.data) ? payload.data.error : null,
  ];

  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? fallback
  );
}

function normalizeMarginCalculationResponse(
  payload: unknown,
): MarginCalculationResponse {
  const source =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;

  if (!isRecord(source)) {
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  }

  const excelRate = source.excelRate;
  const excelEx = source.excelEx;
  const finalResult = source.finalResult;
  const productionCost = source.productionCost;

  if (
    typeof excelRate !== "number" ||
    typeof excelEx !== "string" ||
    typeof productionCost !== "number" ||
    !Array.isArray(finalResult) ||
    finalResult.some((value) => typeof value !== "number")
  ) {
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  }

  return {
    excelRate,
    excelEx,
    finalResult,
    productionCost,
  };
}

async function requestMarginCalculation({
  authConfig,
  authSession,
  payload,
}: MarginCalculationVariables): Promise<MarginCalculationResponse> {
  if (authConfig.mode === "mock") {
    await delay(350);

    return {
      excelRate: 11,
      excelEx: "test",
      finalResult: [11, 12],
      productionCost: 100,
    };
  }

  const response = await fetch(
    buildUrl(authConfig.apiBaseUrl, MARGIN_CALCULATION_PATH),
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(authSession?.csrfToken
          ? { "X-CSRF-Token": authSession.csrfToken }
          : {}),
      },
      body: JSON.stringify(payload),
    },
  );
  const responseJson = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        responseJson,
        `Margin calculation request failed with status ${response.status}.`,
      ),
    );
  }

  return normalizeMarginCalculationResponse(responseJson);
}

export function useRequestMarginCalculationMutation() {
  return useMutation({
    mutationKey: ["popup-home", "margin-calculation"],
    networkMode: "always",
    mutationFn: requestMarginCalculation,
  });
}
