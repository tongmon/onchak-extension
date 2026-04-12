import { useState, useTransition, type ReactElement } from 'react';
import { Alert, Paper, Stack, Switch, Text } from '@mantine/core';
import { useExtensionSettingsStore } from '@/entities/settings';
import { sendRuntimeMessage } from '@/shared/extension';

export function TogglePageOverlayCard(): ReactElement {
  const overlayEnabled = useExtensionSettingsStore(
    (state) => state.settings.pageOverlayEnabled,
  );
  const updateSettings = useExtensionSettingsStore((state) => state.update);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (enabled: boolean): void => {
    startTransition(async () => {
      try {
        setErrorMessage(null);
        await updateSettings({ pageOverlayEnabled: enabled });
        await sendRuntimeMessage({
          type: 'page/set-active-tab-overlay',
          payload: { enabled },
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to apply the overlay setting.',
        );
      }
    });
  };

  return (
    <Paper p="lg" radius="xl" shadow="sm" withBorder>
      <Stack gap="md">
        <Stack gap={6}>
          <Text fw={700}>Page overlay</Text>
          <Text c="dimmed" size="sm">
            Keep the active tab in sync through the background worker and mirror
            the preference to <code>chrome.storage.sync</code>.
          </Text>
        </Stack>

        <Switch
          checked={overlayEnabled}
          description="Content scripts stay lightweight and react to storage changes without using React."
          disabled={isPending}
          label={overlayEnabled ? 'Overlay enabled' : 'Overlay disabled'}
          onChange={(event) => {
            handleToggle(event.currentTarget.checked);
          }}
          size="md"
        />

        {errorMessage ? (
          <Alert color="red" radius="lg" title="Overlay update failed">
            {errorMessage}
          </Alert>
        ) : null}
      </Stack>
    </Paper>
  );
}
