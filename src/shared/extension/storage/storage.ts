import {
  defaultExtensionSettings,
  defaultExtensionStorage,
  normalizeExtensionSettings,
  type ExtensionSettings,
  type ExtensionStorageSchema,
} from './schema';

type StorageKey = keyof ExtensionStorageSchema;

const storageArea = chrome.storage.sync;

async function ensureDefaults(): Promise<void> {
  const current = (await storageArea.get(['settings'])) as {
    settings?: Partial<ExtensionSettings>;
  };
  const nextSettings = normalizeExtensionSettings(current.settings);

  if (
    current.settings === undefined ||
    current.settings?.colorScheme !== nextSettings.colorScheme ||
    current.settings?.pageOverlayEnabled !== nextSettings.pageOverlayEnabled
  ) {
    await storageArea.set({ settings: nextSettings });
  }
}

async function get<K extends StorageKey>(
  key: K,
): Promise<ExtensionStorageSchema[K]> {
  if (key === 'settings') {
    const result = (await storageArea.get(['settings'])) as {
      settings?: Partial<ExtensionSettings>;
    };

    return normalizeExtensionSettings(
      result.settings,
    ) as ExtensionStorageSchema[K];
  }

  return defaultExtensionStorage[key];
}

async function set<K extends StorageKey>(
  key: K,
  value: ExtensionStorageSchema[K],
): Promise<void> {
  if (key === 'settings') {
    await storageArea.set({
      settings: normalizeExtensionSettings(
        value as Partial<ExtensionSettings> | undefined,
      ),
    });
    return;
  }

  await storageArea.set({ [key]: value } as Pick<ExtensionStorageSchema, K>);
}

async function updateSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await get('settings');
  const nextSettings = normalizeExtensionSettings({
    ...current,
    ...patch,
  });

  await set('settings', nextSettings);

  return nextSettings;
}

function subscribe(
  listener: (changes: Partial<ExtensionStorageSchema>) => void,
): () => void {
  const handleChanges = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'sync') {
      return;
    }

    const nextChanges: Partial<ExtensionStorageSchema> = {};

    if (changes.settings) {
      nextChanges.settings = normalizeExtensionSettings(
        changes.settings.newValue as Partial<ExtensionSettings> | undefined,
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

export const extensionStorage = {
  ensureDefaults,
  get,
  set,
  updateSettings,
  subscribe,
  defaults: defaultExtensionSettings,
};
