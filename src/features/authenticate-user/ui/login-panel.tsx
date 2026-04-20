import { useEffect, type ReactElement } from 'react';
import { Box, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useLoginMutation, type AuthConfig } from '@/entities/auth';
import {
  createInitialLoginFormValues,
  type LoginFormValues,
} from '../model/login-form';
import { LoginPanelForm } from './login-panel-form';
import { LoginPanelIntro } from './login-panel-intro';

interface LoginPanelProps {
  authConfig: AuthConfig;
  surface: 'popup' | 'options';
}

export function LoginPanel({
  authConfig,
  surface,
}: LoginPanelProps): ReactElement {
  const loginMutation = useLoginMutation();
  const form = useForm<LoginFormValues>({
    mode: 'controlled',
    initialValues: createInitialLoginFormValues(authConfig),
    validate: {
      email: (value) =>
        value.trim().length === 0 ? '이메일을 입력해주세요.' : null,
      password: (value) =>
        value.length === 0 ? '비밀번호를 입력해주세요.' : null,
      apiBaseUrl: (value, values) =>
        values.mode === 'remote' && value.trim().length === 0
          ? 'Server origin is required'
          : null,
      csrfPath: (value, values) =>
        values.mode === 'remote' && value.trim().length === 0
          ? 'CSRF endpoint is required'
          : null,
    },
  });

  useEffect(() => {
    const currentValues = form.getValues();

    if (
      currentValues.mode === authConfig.mode &&
      currentValues.apiBaseUrl === authConfig.apiBaseUrl &&
      currentValues.csrfPath === authConfig.csrfPath
    ) {
      return;
    }

    form.setValues((current) => ({
      ...current,
      mode: authConfig.mode,
      apiBaseUrl: authConfig.apiBaseUrl,
      csrfPath: authConfig.csrfPath,
    }));
  }, [authConfig.apiBaseUrl, authConfig.csrfPath, authConfig.mode]);

  const compact = surface === 'popup';
  const isMockMode = form.values.mode === 'mock';

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await loginMutation.mutateAsync({
        credentials: {
          email: values.email,
          password: values.password,
        },
        config: {
          mode: values.mode,
          apiBaseUrl: values.apiBaseUrl,
          loginPath: authConfig.loginPath,
          csrfPath: values.csrfPath,
        },
      });
    } catch {
      // The mutation state is rendered by the form.
    }
  });

  return (
    <Box mih="100dvh" px="md" py="md">
      <Stack
        align="center"
        gap={0}
        mih="calc(100dvh - var(--mantine-spacing-md) * 2)"
      >
        <LoginPanelIntro />

        <LoginPanelForm
          compact={compact}
          errorMessage={loginMutation.isError ? loginMutation.error.message : null}
          form={form}
          isMockMode={isMockMode}
          isSubmitting={loginMutation.isPending}
          onSubmit={handleSubmit}
        />
      </Stack>
    </Box>
  );
}
