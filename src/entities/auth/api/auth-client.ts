import {
  deriveDisplayName,
  normalizeAuthConfig,
  type AuthConfig,
  type AuthSession,
  type LoginCredentials,
} from '../model/schema';

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function createMockToken(prefix: string): string {
  const randomSuffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `${prefix}_${randomSuffix}`;
}

function buildUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBaseUrl = baseUrl.endsWith('/')
    ? `${baseUrl}`
    : `${baseUrl}/`;

  return new URL(path.replace(/^\//, ''), normalizedBaseUrl).toString();
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

  if (typeof value !== 'object' || value === null) {
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
    getNestedRecord(payload, 'data')?.message,
    getNestedRecord(payload, 'data')?.error,
  ];

  const firstMessage = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );

  return firstMessage ?? fallback;
}

function extractCsrfToken(
  payload: Record<string, unknown> | null,
  response: Response,
): string | null {
  const tokenCandidates = [
    payload?.csrfToken,
    payload?.token,
    getNestedRecord(payload, 'data')?.csrfToken,
    getNestedRecord(payload, 'data')?.token,
    response.headers.get('x-csrf-token'),
    response.headers.get('X-CSRF-Token'),
  ];

  return (
    tokenCandidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0,
    ) ?? null
  );
}

function extractUser(
  payload: Record<string, unknown> | null,
  email: string,
): AuthSession['user'] {
  const userRecord =
    getNestedRecord(payload, 'user') ?? getNestedRecord(getNestedRecord(payload, 'data'), 'user');

  const resolvedEmail =
    typeof userRecord?.email === 'string' && userRecord.email.trim().length > 0
      ? userRecord.email
      : email;
  const displayNameCandidate =
    typeof userRecord?.displayName === 'string'
      ? userRecord.displayName
      : typeof userRecord?.name === 'string'
        ? userRecord.name
        : '';

  return {
    email: resolvedEmail,
    displayName: displayNameCandidate.trim() || deriveDisplayName(resolvedEmail),
  };
}

async function fetchCsrfToken(config: AuthConfig): Promise<string> {
  const csrfUrl = buildUrl(config.apiBaseUrl, config.csrfPath);
  const response = await fetch(csrfUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
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
    throw new Error(
      `CSRF token was not returned from ${config.csrfPath}.`,
    );
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
    throw new Error('Email and password are required.');
  }

  if (password.toLowerCase() === 'wrong') {
    throw new Error(
      'Mock login rejected the password so you can test the error state.',
    );
  }

  return {
    user: {
      email,
      displayName: deriveDisplayName(email),
    },
    authenticatedAt: new Date().toISOString(),
    mode: 'mock',
    apiBaseUrl: config.apiBaseUrl,
    csrfToken: createMockToken('mock_csrf'),
  };
}

async function loginWithRemote(
  credentials: LoginCredentials,
  config: AuthConfig,
): Promise<AuthSession> {
  const email = credentials.email.trim();
  const password = credentials.password.trim();

  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const csrfToken = await fetchCsrfToken(config);
  const loginUrl = buildUrl(config.apiBaseUrl, config.loginPath);
  const response = await fetch(loginUrl, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      email,
      password,
      csrfToken,
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

  return {
    user: extractUser(payload, email),
    authenticatedAt: new Date().toISOString(),
    mode: 'remote',
    apiBaseUrl: config.apiBaseUrl,
    csrfToken,
  };
}

export async function login(
  credentials: LoginCredentials,
  config: AuthConfig,
): Promise<AuthSession> {
  const normalizedConfig = normalizeAuthConfig(config);

  if (normalizedConfig.mode === 'mock') {
    return loginWithMock(credentials, normalizedConfig);
  }

  return loginWithRemote(credentials, normalizedConfig);
}
