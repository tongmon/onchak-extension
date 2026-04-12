import {
  normalizeAuthConfig,
  normalizeAuthSession,
  type AuthConfig,
  type AuthState,
  type AuthSession,
} from './schema';

const storageArea = chrome.storage.local;

async function ensureDefaults(): Promise<void> {
  const result = (await storageArea.get(['authConfig'])) as {
    authConfig?: Partial<AuthConfig>;
  };
  const nextConfig = normalizeAuthConfig(result.authConfig);

  if (
    result.authConfig === undefined ||
    result.authConfig.mode !== nextConfig.mode ||
    result.authConfig.apiBaseUrl !== nextConfig.apiBaseUrl ||
    result.authConfig.loginPath !== nextConfig.loginPath ||
    result.authConfig.csrfPath !== nextConfig.csrfPath
  ) {
    await storageArea.set({ authConfig: nextConfig });
  }
}

async function getConfig(): Promise<AuthConfig> {
  const result = (await storageArea.get(['authConfig'])) as {
    authConfig?: Partial<AuthConfig>;
  };

  return normalizeAuthConfig(result.authConfig);
}

async function setConfig(config: Partial<AuthConfig>): Promise<AuthConfig> {
  const nextConfig = normalizeAuthConfig(config);

  await storageArea.set({ authConfig: nextConfig });

  return nextConfig;
}

async function getSession(): Promise<AuthSession | null> {
  const result = (await storageArea.get(['authSession'])) as {
    authSession?: Partial<AuthSession> | null;
  };

  return normalizeAuthSession(result.authSession);
}

async function setSession(session: AuthSession | null): Promise<void> {
  if (session) {
    await storageArea.set({
      authSession: normalizeAuthSession(session),
    });
    return;
  }

  await storageArea.remove('authSession');
}

async function clearSession(): Promise<void> {
  await storageArea.remove('authSession');
}

function subscribe(listener: (changes: Partial<AuthState>) => void): () => void {
  const handleChanges = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') {
      return;
    }

    const nextChanges: Partial<AuthState> = {};

    if (changes.authConfig) {
      nextChanges.config = normalizeAuthConfig(
        changes.authConfig.newValue as Partial<AuthConfig> | undefined,
      );
    }

    if (changes.authSession) {
      nextChanges.session = normalizeAuthSession(
        changes.authSession.newValue as Partial<AuthSession> | null | undefined,
      );
    }

    if (Object.keys(nextChanges).length > 0) {
      listener(nextChanges);
    }
  };

  chrome.storage.onChanged.addListener(handleChanges);

  return () => {
    chrome.storage.onChanged.removeListener(handleChanges);
  };
}

export const authStorage = {
  ensureDefaults,
  getConfig,
  setConfig,
  getSession,
  setSession,
  clearSession,
  subscribe,
};
