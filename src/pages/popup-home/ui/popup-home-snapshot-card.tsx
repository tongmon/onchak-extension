import type { ReactElement } from 'react';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import type { PopularSearchSnapshot } from '@/shared/extension';
import { formatCurrency, formatRange } from '../model/popup-home-form';

interface PopupHomeSnapshotCardProps {
  snapshot: PopularSearchSnapshot;
}

export function PopupHomeSnapshotCard({
  snapshot,
}: PopupHomeSnapshotCardProps): ReactElement {
  return (
    <Paper p="lg" radius="xl" shadow="sm" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={700}>파싱된 인기상품 정보</Text>
          <Badge color="teal" radius="xl" variant="light">
            {snapshot.popularItems.length} items
          </Badge>
        </Group>

        <Text size="sm">
          검색어: <strong>{snapshot.searchKeyword}</strong>
        </Text>

        <Text c="dimmed" size="sm">
          평균가 {formatCurrency(snapshot.averageCost)}원
        </Text>

        <Text c="dimmed" size="sm">
          가격범위 {formatRange(snapshot.costRange, '원')}
        </Text>
      </Stack>
    </Paper>
  );
}
