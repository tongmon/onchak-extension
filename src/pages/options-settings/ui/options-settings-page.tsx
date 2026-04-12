import { useTransition, type ReactElement } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useAuthStateQuery, useLogoutMutation } from '@/entities/auth';
import { SelectThemePreferenceCard } from '@/features/select-theme-preference';
import { TogglePageOverlayCard } from '@/features/toggle-page-overlay';
import { useExtensionSettingsStore } from '@/entities/settings';
import { ExtensionShell } from '@/shared/ui/extension-shell';

export function OptionsSettingsPage(): ReactElement {
  const authStateQuery = useAuthStateQuery();
  const logoutMutation = useLogoutMutation();
  const resetSettings = useExtensionSettingsStore((state) => state.reset);
  const status = useExtensionSettingsStore((state) => state.status);
  const errorMessage = useExtensionSettingsStore((state) => state.errorMessage);
  const [isPending, startTransition] = useTransition();
  const session = authStateQuery.data?.session;

  return (
    <ExtensionShell
      actions={
        <Group gap="xs">
          <Badge color="teal" radius="xl" variant="light">
            {session?.user.email ?? 'Authenticated'}
          </Badge>
          <Badge color="teal" radius="xl" variant="light">
            chrome.storage.sync
          </Badge>
          <Badge color="cyan" radius="xl" variant="light">
            FSD UI
          </Badge>
          <Button
            loading={logoutMutation.isPending}
            onClick={() => {
              void logoutMutation.mutateAsync();
            }}
            radius="xl"
            size="xs"
            variant="default"
          >
            Sign out
          </Button>
        </Group>
      }
      description="Options is the long-lived management surface. Shared settings stay in the entity layer, while extension APIs remain in shared platform code."
      eyebrow="Options"
      surface="options"
      title="Extension Settings"
    >
      {session ? (
        <Alert color="teal" radius="lg" title="Authenticated session">
          Signed in as {session.user.displayName} via {session.mode} mode.
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert color="red" radius="lg" title="Settings sync issue">
          {errorMessage}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        <SelectThemePreferenceCard />
        <TogglePageOverlayCard />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        <Paper p="lg" radius="xl" shadow="sm" withBorder>
          <Stack gap="md">
            <Text fw={700}>Starter rules</Text>
            <Text c="dimmed" size="sm">
              Popup and options use React, Mantine, Zustand, and React Query.
              Background and content stay framework-light so MV3 runtime
              constraints remain explicit.
            </Text>
            <Text c="dimmed" size="sm">
              The content script intentionally avoids Mantine and React. It
              injects a small isolated overlay and listens for storage or
              background messages.
            </Text>
          </Stack>
        </Paper>

        <Paper p="lg" radius="xl" shadow="sm" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={700}>Preferences</Text>
              <Badge
                color={status === 'ready' ? 'teal' : 'gray'}
                radius="xl"
                variant="dot"
              >
                {status}
              </Badge>
            </Group>

            <Text c="dimmed" size="sm">
              Reset the shared settings to the starter defaults without
              touching unrelated extension state.
            </Text>

            <Button
              loading={isPending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await resetSettings();
                  } catch {
                    // The shared settings store exposes the error state to the page.
                  }
                });
              }}
              radius="xl"
              variant="default"
            >
              Reset to defaults
            </Button>
          </Stack>
        </Paper>
      </SimpleGrid>
    </ExtensionShell>
  );
}
