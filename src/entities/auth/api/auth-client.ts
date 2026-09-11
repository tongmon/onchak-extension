import {
  deriveDisplayName,
  normalizeAuthConfig,
  type AuthConfig,
  type AuthSession,
  type LoginCredentials,
} from "../model/schema.ts";

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function createMockToken(prefix: string): string {
  const randomSuffix =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${prefix}_${randomSuffix}`;
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.endsWith("/")
    ? `${baseUrl}`
    : `${baseUrl}/`;

  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString();
}

async function parseResponseJson(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getNestedRecord(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!record) {
    return null;
  }

  const value = record[key];

  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractErrorMessage(
  payload: Record<string, unknown> | null,
  fallback: string,
): string {
  if (!payload) {
    return fallback;
  }

  const candidates = [
    payload.message,
    payload.error,
    getNestedRecord(payload, "data")?.message,
    getNestedRecord(payload, "data")?.error,
  ];

  const firstMessage = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );

  return firstMessage ?? fallback;
}

function extractString(
  payload: Record<string, unknown> | null,
  keys: string[],
): string | null {
  for (const key of keys) {
    const candidate = payload?.[key] ?? getNestedRecord(payload, "data")?.[key];

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function extractCsrfToken(
  payload: Record<string, unknown> | null,
  response: Response,
): string | null {
  const tokenCandidates = [
    payload?.csrfToken,
    payload?.token,
    getNestedRecord(payload, "data")?.csrfToken,
    getNestedRecord(payload, "data")?.token,
    response.headers.get("x-csrf-token"),
    response.headers.get("X-CSRF-Token"),
  ];

  return (
    tokenCandidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    ) ?? null
  );
}

function extractUser(
  payload: Record<string, unknown> | null,
  email: string,
): AuthSession["user"] {
  const userRecord =
    getNestedRecord(payload, "user") ??
    getNestedRecord(getNestedRecord(payload, "data"), "user");

  const resolvedEmail =
    typeof userRecord?.email === "string" && userRecord.email.trim().length > 0
      ? userRecord.email
      : email;
  const displayNameCandidate =
    typeof userRecord?.displayName === "string"
      ? userRecord.displayName
      : typeof userRecord?.name === "string"
        ? userRecord.name
        : "";

  return {
    email: resolvedEmail,
    displayName:
      displayNameCandidate.trim() || deriveDisplayName(resolvedEmail),
  };
}

async function fetchCsrfToken(config: AuthConfig): Promise<string> {
  const csrfUrl = buildUrl(config.apiBaseUrl, config.csrfPath);
  const response = await fetch(csrfUrl, {
    method: "GET",
    credentials: "include",
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        payload,
        `CSRF token request failed with status ${response.status}.`,
      ),
    );
  }

  const csrfToken = extractCsrfToken(payload, response);

  if (!csrfToken) {
    throw new Error(`CSRF token was not returned from ${config.csrfPath}.`);
  }

  return csrfToken;
}

async function loginWithMock(
  credentials: LoginCredentials,
  config: AuthConfig,
): Promise<AuthSession> {
  await delay(350);

  const email = credentials.email.trim();
  const password = credentials.password.trim();

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  if (password.toLowerCase() === "wrong") {
    throw new Error(
      "Mock login rejected the password so you can test the error state.",
    );
  }

  return {
    user: {
      email,
      displayName: deriveDisplayName(email),
    },
    authenticatedAt: new Date().toISOString(),
    mode: "mock",
    apiBaseUrl: config.apiBaseUrl,
    csrfToken: createMockToken("mock_csrf"),
    accessToken: createMockToken("mock_access"),
    tokenType: "Bearer",
  };
}

async function loginWithRemote(
  credentials: LoginCredentials,
  config: AuthConfig,
): Promise<AuthSession> {
  const email = credentials.email.trim();
  const password = credentials.password.trim();

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const csrfToken = await fetchCsrfToken(config);
  const loginUrl = buildUrl(config.apiBaseUrl, config.loginPath);
  const response = await fetch(loginUrl, {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({
      username: email,
      userId: email,
      password,
    }),
  });
  const payload = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(
        payload,
        `Login request failed with status ${response.status}.`,
      ),
    );
  }

  if (
    payload?.authStatus === "MFA_REQUIRED" ||
    payload?.authStatus === "MFA_ENROLLMENT_REQUIRED"
  ) {
    const challengeToken = extractString(payload, ["challengeToken"]);
    if (!challengeToken) throw new Error("2단계 인증 요청 정보가 없습니다.");
    throw new MfaChallengeRequired({
      status: payload.authStatus,
      challengeToken,
      config,
      email,
      csrfToken,
    });
  }

  const accessToken = extractString(payload, ["accessToken"]);
  const tokenType = extractString(payload, ["tokenType"]) ?? "Bearer";

  if (!accessToken) {
    throw new Error("Login response did not include an access token.");
  }

  return {
    user: extractUser(payload, email),
    authenticatedAt: new Date().toISOString(),
    mode: "remote",
    apiBaseUrl: config.apiBaseUrl,
    csrfToken,
    accessToken,
    tokenType,
  };
}

export async function login(
  credentials: LoginCredentials,
  config: AuthConfig,
): Promise<AuthSession> {
  const normalizedConfig = normalizeAuthConfig(config);

  if (normalizedConfig.mode === "mock") {
    return loginWithMock(credentials, normalizedConfig);
  }

  return loginWithRemote(credentials, normalizedConfig);
}

export interface MfaChallenge {
  status: "MFA_REQUIRED" | "MFA_ENROLLMENT_REQUIRED";
  challengeToken: string;
  config: AuthConfig;
  email: string;
  csrfToken: string;
}
export class MfaChallengeRequired extends Error {
  challenge: MfaChallenge;
  constructor(challenge: MfaChallenge) {
    super("2단계 인증을 완료해 주세요.");
    this.challenge = challenge;
  }
}
async function mfaRequest(
  challenge: MfaChallenge,
  path: string,
  code?: string,
) {
  const response = await fetch(buildUrl(challenge.config.apiBaseUrl, path), {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": challenge.csrfToken,
    },
    body: JSON.stringify({
      challengeToken: challenge.challengeToken,
      ...(code ? { code } : {}),
    }),
  });
  const payload = await parseResponseJson(response);
  if (!response.ok || !payload)
    throw new Error(
      extractErrorMessage(
        payload,
        "인증에 실패했습니다. 코드를 확인하거나 다시 로그인해 주세요.",
      ),
    );
  return payload;
}
export async function prepareMfaEnrollment(
  challenge: MfaChallenge,
): Promise<string> {
  const payload = await mfaRequest(challenge, "/api/auth/mfa/enroll/prepare");
  const key = extractString(payload, ["manualKey"]);
  if (!key) throw new Error("인증 앱 등록 키를 받지 못했습니다.");
  return key;
}
export async function completeMfaLogin(
  challenge: MfaChallenge,
  code: string,
): Promise<{ session: AuthSession; recoveryCodes: string[] }> {
  const payload = await mfaRequest(
    challenge,
    challenge.status === "MFA_ENROLLMENT_REQUIRED"
      ? "/api/auth/mfa/enroll/confirm"
      : "/api/auth/mfa/verify",
    code.trim(),
  );
  const accessToken = extractString(payload, ["accessToken"]);
  if (!accessToken || payload.authStatus !== "AUTHENTICATED")
    throw new Error("인증 완료 응답이 올바르지 않습니다.");
  return {
    session: {
      user: extractUser(payload, challenge.email),
      authenticatedAt: new Date().toISOString(),
      mode: "remote",
      apiBaseUrl: challenge.config.apiBaseUrl,
      csrfToken: challenge.csrfToken,
      accessToken,
      tokenType: "Bearer",
    },
    recoveryCodes: Array.isArray(payload.recoveryCodes)
      ? payload.recoveryCodes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}
