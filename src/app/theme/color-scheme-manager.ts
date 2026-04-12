import type { MantineColorSchemeManager } from '@mantine/core';

// Extension pages derive color scheme from chrome.storage.sync, not localStorage.
export const extensionColorSchemeManager: MantineColorSchemeManager = {
  get: (defaultValue) => defaultValue,
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};
