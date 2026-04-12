export type AuthMode = 'mock' | 'remote';

export interface AuthUser {
  email: string;
  displayName: string;
}

export interface AuthConfig {
  mode: AuthMode;
  apiBaseUrl: string;
  loginPath: string;
  csrfPath: string;
}

export interface AuthSession {
  user: AuthUser;
  authenticatedAt: string;
  mode: AuthMode;
  apiBaseUrl: string;
  csrfToken: string;
}

export interface AuthState {
  config: AuthConfig;
  session: AuthSession | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export const defaultAuthConfig: AuthConfig = {
  mode: 'mock',
  apiBaseUrl: 'http://localhost:3000',
  loginPath: '/api/auth/login',
  csrfPath: '/api/auth/csrf',
};

function normalizeApiBaseUrl(input?: string | null): string {
  const trimmed = input?.trim();

  if (!trimmed) {
    return defaultAuthConfig.apiBaseUrl;
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function normalizeAuthPath(
  input: string | null | undefined,
  fallback: string,
): string {
  const trimmed = input?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function normalizeAuthMode(input?: AuthMode | null): AuthMode {
  return input === 'remote' ? 'remote' : 'mock';
}

function isIsoDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function deriveDisplayName(email: string): string {
  const localPart = email.split('@')[0]?.trim();

  if (!localPart) {
    return 'Onchak User';
  }

  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1));

  return words.join(' ') || 'Onchak User';
}

export function normalizeAuthConfig(
  input?: Partial<AuthConfig> | null,
): AuthConfig {
  return {
    mode: normalizeAuthMode(input?.mode),
    apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl),
    loginPath: normalizeAuthPath(
      input?.loginPath,
      defaultAuthConfig.loginPath,
    ),
    csrfPath: normalizeAuthPath(input?.csrfPath, defaultAuthConfig.csrfPath),
  };
}

export function normalizeAuthSession(
  input?: Partial<AuthSession> | null,
): AuthSession | null {
  const email = input?.user?.email?.trim();

  if (!email) {
    return null;
  }

  const authenticatedAt = input?.authenticatedAt?.trim();

  return {
    user: {
      email,
      displayName:
        input?.user?.displayName?.trim() || deriveDisplayName(email),
    },
    authenticatedAt:
      authenticatedAt && isIsoDateString(authenticatedAt)
        ? authenticatedAt
        : new Date().toISOString(),
    mode: normalizeAuthMode(input?.mode),
    apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl),
    csrfToken: input?.csrfToken?.trim() ?? '',
  };
}
