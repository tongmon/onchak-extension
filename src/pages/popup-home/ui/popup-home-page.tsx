import type { ReactElement } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { useAuthStateQuery, useLogoutMutation } from '@/entities/auth';
import { TogglePageOverlayCard } from '@/features/toggle-page-overlay';
import { ExtensionShell } from '@/shared/ui/extension-shell';
import { useExtensionContextQuery } from '../api/get-extension-context-query';

function ContextValue({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs" tt="uppercase">
        {label}
      </Text>
      <Text fw={600} size="sm">
        {value}
      </Text>
    </Stack>
  );
}

export function PopupHomePage(): ReactElement {
  const authStateQuery = useAuthStateQuery();
  const logoutMutation = useLogoutMutation();
  const extensionContextQuery = useExtensionContextQuery();
  const session = authStateQuery.data?.session;

  return (
    <ExtensionShell
      actions={
        <Group gap="xs">
          <Badge color="teal" radius="xl" variant="light">
            {session?.user.displayName ?? 'Signed in'}
          </Badge>
          <Badge color="teal" radius="xl" variant="light">
            MV3
          </Badge>
          <Badge color="blue" radius="xl" variant="dot">
            React 19
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
      description="Popup surfaces stay focused on quick actions while background and content work continue in separate extension contexts."
      eyebrow="Popup"
      surface="popup"
      title="Onchak Extension"
    >
      <Paper p="lg" radius="xl" shadow="sm" withBorder>
        <Stack gap="md">
          {session ? (
            <Alert color="teal" radius="lg" title="Authenticated session">
              Signed in as {session.user.email} via {session.mode} mode.
            </Alert>
          ) : null}

          <Group justify="space-between">
            <Stack gap={4}>
              <Text fw={700}>Extension context</Text>
              <Text c="dimmed" size="sm">
                Loaded through a typed popup to background to content bridge.
              </Text>
            </Stack>

            <Button
              loading={extensionContextQuery.isFetching}
              onClick={() => {
                void extensionContextQuery.refetch();
              }}
              radius="xl"
              size="xs"
              variant="light"
            >
              Refresh
            </Button>
          </Group>

          {extensionContextQuery.isPending ? (
            <Group justify="center" py="lg">
              <Loader color="teal" size="sm" />
            </Group>
          ) : null}

          {extensionContextQuery.isError ? (
            <Alert color="red" radius="lg" title="Bridge request failed">
              {extensionContextQuery.error.message}
            </Alert>
          ) : null}

          {extensionContextQuery.data ? (
            <Stack gap="md">
              <Group grow>
                <ContextValue
                  label="Version"
                  value={extensionContextQuery.data.extensionVersion}
                />
                <ContextValue
                  label="Storage"
                  value={extensionContextQuery.data.storageArea}
                />
              </Group>

              <ContextValue
                label="Handled at"
                value={new Date(
                  extensionContextQuery.data.handledAt,
                ).toLocaleTimeString()}
              />

              <Stack gap={6}>
                <Text c="dimmed" size="xs" tt="uppercase">
                  Active tab
                </Text>
                <Text fw={600}>
                  {extensionContextQuery.data.activeTab.pageTitle ??
                    'No supported web page'}
                </Text>
                <Code block>
                  {extensionContextQuery.data.activeTab.tabUrl ?? 'n/a'}
                </Code>
                <Group gap="xs">
                  <Badge
                    color={
                      extensionContextQuery.data.activeTab.contentScriptConnected
                        ? 'teal'
                        : 'gray'
                    }
                    radius="xl"
                    variant="light"
                  >
                    {extensionContextQuery.data.activeTab.contentScriptConnected
                      ? 'Content connected'
                      : 'No content bridge'}
                  </Badge>
                  <Badge
                    color={
                      extensionContextQuery.data.activeTab.overlayEnabled
                        ? 'blue'
                        : 'gray'
                    }
                    radius="xl"
                    variant="light"
                  >
                    {extensionContextQuery.data.activeTab.overlayEnabled
                      ? 'Overlay active'
                      : 'Overlay idle'}
                  </Badge>
                </Group>
              </Stack>

              {!extensionContextQuery.data.activeTab.contentScriptConnected ? (
                <Alert
                  color="yellow"
                  radius="lg"
                  title="Content scripts are scoped"
                >
                  This starter content script only runs on matched HTTP and
                  HTTPS pages, not Chrome internal pages.
                </Alert>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      <TogglePageOverlayCard />

      <Button
        fullWidth
        onClick={() => {
          void chrome.runtime.openOptionsPage();
        }}
        radius="xl"
        variant="default"
      >
        Open full settings
      </Button>
    </ExtensionShell>
  );
}
