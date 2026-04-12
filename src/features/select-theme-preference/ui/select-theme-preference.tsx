import { useTransition, type ReactElement } from 'react';
import { Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import {
  type ExtensionColorScheme,
  useExtensionSettingsStore,
} from '@/entities/settings';

const colorSchemeOptions: Array<{
  label: string;
  value: ExtensionColorScheme;
}> = [
  { label: 'Auto', value: 'auto' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export function SelectThemePreferenceCard(): ReactElement {
  const colorScheme = useExtensionSettingsStore(
    (state) => state.settings.colorScheme,
  );
  const updateSettings = useExtensionSettingsStore((state) => state.update);
  const [isPending, startTransition] = useTransition();

  return (
    <Paper p="lg" radius="xl" shadow="sm" withBorder>
      <Stack gap="md">
        <Stack gap={6}>
          <Text fw={700}>Extension pages theme</Text>
          <Text c="dimmed" size="sm">
            Mantine follows the shared setting stored in
            <code>chrome.storage.sync</code> instead of relying on localStorage.
          </Text>
        </Stack>

        <SegmentedControl
          data={colorSchemeOptions}
          disabled={isPending}
          fullWidth
          onChange={(value) => {
            startTransition(async () => {
              try {
                await updateSettings({
                  colorScheme: value as ExtensionColorScheme,
                });
              } catch {
                // The shared settings store exposes the error state to the page.
              }
            });
          }}
          value={colorScheme}
        />
      </Stack>
    </Paper>
  );
}
