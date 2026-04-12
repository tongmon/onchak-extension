export type ExtensionColorScheme = 'auto' | 'light' | 'dark';

export interface ExtensionSettings {
  colorScheme: ExtensionColorScheme;
  pageOverlayEnabled: boolean;
}

export interface ExtensionStorageSchema {
  settings: ExtensionSettings;
}

export const defaultExtensionSettings: ExtensionSettings = {
  colorScheme: 'auto',
  pageOverlayEnabled: true,
};

export const defaultExtensionStorage: ExtensionStorageSchema = {
  settings: defaultExtensionSettings,
};

export function normalizeExtensionSettings(
  input?: Partial<ExtensionSettings> | null,
): ExtensionSettings {
  return {
    colorScheme:
      input?.colorScheme === 'light' || input?.colorScheme === 'dark'
        ? input.colorScheme
        : defaultExtensionSettings.colorScheme,
    pageOverlayEnabled:
      typeof input?.pageOverlayEnabled === 'boolean'
        ? input.pageOverlayEnabled
        : defaultExtensionSettings.pageOverlayEnabled,
  };
}

