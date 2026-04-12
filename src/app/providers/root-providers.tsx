import { useEffect, type PropsWithChildren, type ReactElement } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  authStateQueryKey,
  authStorage,
  defaultAuthConfig,
  type AuthState,
} from '@/entities/auth';
import { useExtensionSettingsStore } from '@/entities/settings';
import { extensionColorSchemeManager, extensionTheme } from '@/app/theme';
import { queryClient } from './query-client';

export function RootProviders({
  children,
}: PropsWithChildren): ReactElement {
  const loadSettings = useExtensionSettingsStore((state) => state.load);
  const status = useExtensionSettingsStore((state) => state.status);
  const colorScheme = useExtensionSettingsStore(
    (state) => state.settings.colorScheme,
  );

  useEffect(() => {
    if (status === 'idle') {
      void loadSettings().catch(() => {
        // The settings store already captures the error state for the UI.
      });
    }
  }, [loadSettings, status]);

  useEffect(() => {
    return authStorage.subscribe((changes) => {
      queryClient.setQueryData<AuthState>(authStateQueryKey, (current) => ({
        config: changes.config ?? current?.config ?? defaultAuthConfig,
        session:
          changes.session === undefined
            ? current?.session ?? null
            : changes.session,
      }));
    });
  }, []);

  const forceColorScheme =
    colorScheme === 'auto' ? undefined : colorScheme;

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider
        colorSchemeManager={extensionColorSchemeManager}
        theme={extensionTheme}
        defaultColorScheme="auto"
        forceColorScheme={forceColorScheme}
      >
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
