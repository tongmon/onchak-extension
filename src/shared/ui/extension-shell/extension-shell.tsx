import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { Box, Paper, Stack, Text, Title } from '@mantine/core';

interface ExtensionShellProps extends PropsWithChildren {
  eyebrow: string;
  title: string;
  description: string;
  surface: 'popup' | 'options';
  actions?: ReactNode;
}

export function ExtensionShell({
  actions,
  children,
  description,
  eyebrow,
  surface,
  title,
}: ExtensionShellProps): ReactElement {
  const compact = surface === 'popup';

  return (
    <Box className="onchak-shell">
      <Stack
        gap={compact ? 'md' : 'xl'}
        maw={compact ? 390 : 980}
        mx="auto"
        p={compact ? 'md' : 'xl'}
      >
        <Paper
          p={compact ? 'md' : 'xl'}
          radius="xl"
          shadow="sm"
          withBorder
          style={{
            background:
              'linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(21, 94, 117, 0.03) 55%, rgba(255, 255, 255, 0.05))',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Stack gap={compact ? 8 : 'md'}>
            <Text
              c="teal"
              fw={700}
              size="xs"
              style={{ letterSpacing: '0.18em', textTransform: 'uppercase' }}
            >
              {eyebrow}
            </Text>

            <Stack gap={6}>
              <Title order={compact ? 3 : 1}>{title}</Title>
              <Text c="dimmed" maw={720} size={compact ? 'sm' : 'md'}>
                {description}
              </Text>
            </Stack>

            {actions}
          </Stack>
        </Paper>

        {children}
      </Stack>
    </Box>
  );
}
