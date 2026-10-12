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

export async function scopedStorageKey(key: string, expectedAccountScope?: string): Promise<string> {
  const state = await chrome.storage.local.get([
    "authConfig",
    "authSession",
    "legacyDataOwner",
  ]);
  const scope = accountScope(state);
  if (!scope) throw new Error("로그인 후 저장된 작업을 불러올 수 있습니다.");
  if (expectedAccountScope && scope !== expectedAccountScope) {
    throw new Error("계정이 변경되어 이전 작업의 파일 정리를 중단했습니다.");
  }
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

/** Snapshot the account once, so delayed cleanup can never remove another account's files. */
export async function removeAccountScopedValue(
  key: string,
  removeValue: (scopedKey: string) => Promise<void>,
  expectedAccountScope?: string,
): Promise<void> {
  const scopedKey = await scopedStorageKey(key, expectedAccountScope);
  await removeValue(scopedKey);
  await chrome.storage.local.remove(scopedKey);
}
