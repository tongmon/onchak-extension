type ScopeState = {
  authConfig?: { apiBaseUrl?: string };
  authSession?: {
    apiBaseUrl?: string;
    mode?: string;
    user?: { email?: string };
  };
};

export function accountScope(state: ScopeState): string | null {
  const session = state.authSession;
  if (
    session?.mode !== "remote" ||
    !session.user?.email ||
    !session.apiBaseUrl ||
    state.authConfig?.apiBaseUrl !== session.apiBaseUrl
  )
    return null;
  return encodeURIComponent(
    `${session.apiBaseUrl}|${session.user.email.trim().toLowerCase()}`,
  );
}

export async function initializeLegacyScope(): Promise<void> {
  const state = await chrome.storage.local.get([
    "authConfig",
    "authSession",
    "legacyDataOwner",
  ]);
  if (state.legacyDataOwner === undefined) {
    // Only the pre-upgrade recorded owner can claim old drafts; never a later account.
    await chrome.storage.local.set({
      legacyDataOwner: accountScope(state) ?? "",
    });
  }
}

export async function scopedStorageKey(key: string): Promise<string> {
  const state = await chrome.storage.local.get([
    "authConfig",
    "authSession",
    "legacyDataOwner",
  ]);
  const scope = accountScope(state);
  if (!scope) throw new Error("로그인 후 저장된 작업을 불러올 수 있습니다.");
  const scoped = `${key}:account:${scope}`;
  if (state.legacyDataOwner === scope) {
    const values = await chrome.storage.local.get([key, scoped]);
    if (values[scoped] === undefined && values[key] !== undefined) {
      await chrome.storage.local.set({ [scoped]: values[key] });
      await chrome.storage.local.remove(key);
    }
  }
  return scoped;
}
