import type { ReactElement } from 'react';
import { Badge, Code, Group, Paper, Stack, Text } from '@mantine/core';
import type { MarginCalculationResponse } from '../api/request-margin-calculation-mutation';

interface PopupHomeResponseCardProps {
  response: MarginCalculationResponse;
  responsePreview: string | null;
}

export function PopupHomeResponseCard({
  response,
  responsePreview,
}: PopupHomeResponseCardProps): ReactElement {
  return (
    <Paper p="lg" radius="xl" shadow="sm" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={700}>서버 응답</Text>
          <Badge color="cyan" radius="xl" variant="light">
            excelRate {response.excelRate}
          </Badge>
        </Group>

        <Text c="dimmed" size="sm">
          excelEx: {response.excelEx}
        </Text>

        <Text c="dimmed" size="sm">
          finalResult: {response.finalResult.join(', ')}
        </Text>

        {responsePreview ? <Code block>{responsePreview}</Code> : null}
      </Stack>
    </Paper>
  );
}
