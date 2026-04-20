import type { ReactElement } from 'react';
import { Anchor, Avatar, Text, Title } from '@mantine/core';
import MainLogo from '@/assets/images/logos/MainLogo.png';

export function LoginPanelIntro(): ReactElement {
  return (
    <>
      <Avatar src={MainLogo} size="xl" mb="xs" />

      <Title mb="xs" order={4}>
        마진률 계산을 시작해볼까요?
      </Title>

      <Text mb="xl" size="sm">
        계정이 없으신가요?{' '}
        <Anchor
          component="button"
          onClick={() => {
            // navigate('/registration');
          }}
        >
          계정 생성
        </Anchor>
      </Text>
    </>
  );
}
