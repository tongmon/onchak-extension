import type { ReactElement } from 'react';
import { Badge, Button, Group } from '@mantine/core';

interface PopupHomeHeaderActionsProps {
  email: string | null | undefined;
  isLoggingOut: boolean;
  onLogout: () => void;
}

export function PopupHomeHeaderActions({
  email,
  isLoggingOut,
  onLogout,
}: PopupHomeHeaderActionsProps): ReactElement {
  return (
    <Group gap="xs">
      <Badge color="teal" radius="xl" variant="light">
        {email ?? 'Authenticated'}
      </Badge>
      <Button
        loading={isLoggingOut}
        onClick={onLogout}
        radius="xl"
        size="xs"
        variant="default"
      >
        로그아웃
      </Button>
    </Group>
  );
}
