import { authStorage } from "../model/auth-storage.ts";
import type { AuthConfig, AuthSession } from "../model/schema.ts";

export class SessionExpiredError extends Error {
  constructor() {
    super(
      "로그인 세션이 만료되었습니다. 다시 로그인한 뒤 작업을 계속해 주세요.",
    );
  }
}

export function isUsableSession(
  config: AuthConfig,
  session: AuthSession | null,
): boolean {
  return (
    !!session &&
    config.mode === "remote" &&
    session.mode === "remote" &&
    !!session.accessToken &&
    config.apiBaseUrl === session.apiBaseUrl
  );
}

export async function requireRemoteSession() {
  const [config, session] = await Promise.all([
    authStorage.getConfig(),
    authStorage.getSession(),
  ]);
  if (!session || !isUsableSession(config, session)) {
    await authStorage.clearSession(session?.accessToken);
    throw new SessionExpiredError();
  }
  return { config, session };
}

export async function validateStoredSession(
  config: AuthConfig,
  session: AuthSession | null,
): Promise<AuthSession | null> {
  if (!session || !isUsableSession(config, session)) {
    if (session) await authStorage.clearSession(session.accessToken);
    return null;
  }
  const response = await fetch(`${config.apiBaseUrl}/api/auth/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    credentials: "include",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) {
    await authStorage.clearSession(session.accessToken);
    return null;
  }
  if (!response.ok)
    throw new Error(
      "서버에서 로그인 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
  const body = await response.json();
  if (body.authenticated === false) {
    await authStorage.clearSession(session.accessToken);
    return null;
  }
  if (body.authenticated !== true)
    throw new Error("로그인 확인 응답 형식이 올바르지 않습니다.");
  return session;
}

/** No automatic replay of a write. Callers retain the pending operation for explicit retry. */
export async function authenticatedFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30000,
  expectedToken?: string,
): Promise<Response> {
  const { config, session } = await requireRemoteSession();
  if (expectedToken && session.accessToken !== expectedToken)
    throw new SessionExpiredError();
  const url = new URL(path, `${config.apiBaseUrl}/`);
  if (url.origin !== new URL(config.apiBaseUrl).origin)
    throw new Error("로그인 서버와 요청 서버가 다릅니다.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("Accept", "application/json");
  if (session.csrfToken) headers.set("X-CSRF-Token", session.csrfToken);
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 401) {
    await authStorage.clearSession(session.accessToken);
    throw new SessionExpiredError();
  }
  if (response.status === 403)
    throw new Error(
      "이 작업을 수행할 권한이 없습니다. 계정 권한을 확인해 주세요.",
    );
  if (response.status === 419)
    throw new Error(
      "요청 인증이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.",
    );
  return response;
}

export async function readSuccessJson(
  response: Response,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "서버 응답을 확인할 수 없습니다. 입력은 보관되어 있습니다.",
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("서버 응답 형식이 올바르지 않습니다.");
  const data = body as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : `서버 요청 실패 (${response.status})`,
    );
  return data;
}
