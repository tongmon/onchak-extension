import type { PropsWithChildren, ReactElement } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
} from '@mantine/core';
import { defaultAuthConfig, useAuthStateQuery } from '@/entities/auth';
import { LoginPanel } from '@/features/authenticate-user';
import { ExtensionShell } from '@/shared/ui/extension-shell';

interface AuthSessionGateProps extends PropsWithChildren {
  surface: 'popup' | 'options';
}

const copyBySurface = {
  popup: {
    eyebrow: 'Access',
    title: 'Sign in to Onchak',
    description:
      'Initialize an authenticated session before using popup actions and extension bridges.',
  },
  options: {
    eyebrow: 'Access',
    title: 'Sign in to manage settings',
    description:
      'Options stays behind the same auth gate so extension management and server-backed features share one session model.',
  },
} as const;

export function AuthSessionGate({
  children,
  surface,
}: AuthSessionGateProps): ReactElement {
  const authStateQuery = useAuthStateQuery();
  const copy = copyBySurface[surface];

  if (authStateQuery.isPending) {
    return (
      <ExtensionShell
        actions={
          <Group gap="xs">
            <Badge color="teal" radius="xl" variant="light">
              Session bootstrap
            </Badge>
          </Group>
        }
        description={copy.description}
        eyebrow={copy.eyebrow}
        surface={surface}
        title={copy.title}
      >
        <Paper p="xl" radius="xl" shadow="sm" withBorder>
          <Group justify="center" py="xl">
            <Loader color="teal" size="sm" />
          </Group>
        </Paper>
      </ExtensionShell>
    );
  }

  if (authStateQuery.isError) {
    return (
      <ExtensionShell
        actions={
          <Group gap="xs">
            <Badge color="red" radius="xl" variant="light">
              Auth bootstrap failed
            </Badge>
          </Group>
        }
        description={copy.description}
        eyebrow={copy.eyebrow}
        surface={surface}
        title={copy.title}
      >
        <Paper p="xl" radius="xl" shadow="sm" withBorder>
          <Alert color="red" radius="lg" title="Failed to load auth state">
            {authStateQuery.error.message}
          </Alert>

          <Button
            mt="md"
            onClick={() => {
              void authStateQuery.refetch();
            }}
            radius="xl"
            variant="default"
          >
            Retry
          </Button>
        </Paper>
      </ExtensionShell>
    );
  }

  if (!authStateQuery.data.session) {
    return (
      <ExtensionShell
        actions={
          <Group gap="xs">
            <Badge color="teal" radius="xl" variant="light">
              CSRF aware
            </Badge>
            <Badge color="cyan" radius="xl" variant="light">
              Mock fallback
            </Badge>
          </Group>
        }
        description={copy.description}
        eyebrow={copy.eyebrow}
        surface={surface}
        title={copy.title}
      >
        <LoginPanel
          authConfig={authStateQuery.data.config ?? defaultAuthConfig}
          surface={surface}
        />
      </ExtensionShell>
    );
  }

  return <>{children}</>;
}
