import { create } from 'zustand';
import {
  defaultExtensionSettings,
  extensionStorage,
  type ExtensionSettings,
} from '@/shared/extension';

type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ExtensionSettingsStore {
  settings: ExtensionSettings;
  status: SettingsStatus;
  errorMessage: string | null;
  load: () => Promise<ExtensionSettings>;
  update: (patch: Partial<ExtensionSettings>) => Promise<ExtensionSettings>;
  reset: () => Promise<ExtensionSettings>;
}

export const useExtensionSettingsStore = create<ExtensionSettingsStore>(
  (set, get) => ({
    settings: defaultExtensionSettings,
    status: 'idle',
    errorMessage: null,

    async load() {
      const currentState = get();

      if (currentState.status === 'ready') {
        return currentState.settings;
      }

      set({ status: 'loading', errorMessage: null });

      try {
        await extensionStorage.ensureDefaults();
        const settings = await extensionStorage.get('settings');

        set({
          settings,
          status: 'ready',
          errorMessage: null,
        });

        return settings;
      } catch (error) {
        set({
          status: 'error',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Failed to load extension settings.',
        });

        throw error;
      }
    },

    async update(patch) {
      try {
        const settings = await extensionStorage.updateSettings(patch);

        set({
          settings,
          status: 'ready',
          errorMessage: null,
        });

        return settings;
      } catch (error) {
        set({
          status: 'error',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Failed to update extension settings.',
        });

        throw error;
      }
    },

    async reset() {
      await extensionStorage.set('settings', defaultExtensionSettings);

      set({
        settings: defaultExtensionSettings,
        status: 'ready',
        errorMessage: null,
      });

      return defaultExtensionSettings;
    },
  }),
);

const settingsSubscription = extensionStorage.subscribe((changes) => {
  if (changes.settings) {
    useExtensionSettingsStore.setState({
      settings: changes.settings,
      status: 'ready',
      errorMessage: null,
    });
  }
});

void settingsSubscription;

