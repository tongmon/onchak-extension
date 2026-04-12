import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import {
  useLoginMutation,
  type AuthConfig,
  type AuthMode,
} from '@/entities/auth';

interface LoginPanelProps {
  authConfig: AuthConfig;
  surface: 'popup' | 'options';
}

interface LoginFormState {
  email: string;
  password: string;
  mode: AuthMode;
  apiBaseUrl: string;
  csrfPath: string;
}

function createInitialFormState(authConfig: AuthConfig): LoginFormState {
  return {
    email: '',
    password: '',
    mode: authConfig.mode,
    apiBaseUrl: authConfig.apiBaseUrl,
    csrfPath: authConfig.csrfPath,
  };
}

export function LoginPanel({
  authConfig,
  surface,
}: LoginPanelProps): ReactElement {
  const loginMutation = useLoginMutation();
  const [formState, setFormState] = useState<LoginFormState>(() =>
    createInitialFormState(authConfig),
  );

  useEffect(() => {
    setFormState((current) => ({
      ...current,
      mode: authConfig.mode,
      apiBaseUrl: authConfig.apiBaseUrl,
      csrfPath: authConfig.csrfPath,
    }));
  }, [authConfig.apiBaseUrl, authConfig.csrfPath, authConfig.mode]);

  const compact = surface === 'popup';
  const isMockMode = formState.mode === 'mock';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await loginMutation.mutateAsync({
        credentials: {
          email: formState.email,
          password: formState.password,
        },
        config: {
          mode: formState.mode,
          apiBaseUrl: formState.apiBaseUrl,
          loginPath: authConfig.loginPath,
          csrfPath: formState.csrfPath,
        },
      });
    } catch {
      // The mutation state is rendered by the form.
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Paper
        p={compact ? 'md' : 'xl'}
        radius="xl"
        shadow="sm"
        withBorder
      >
        <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700} size={compact ? 'md' : 'lg'}>
              Sign in
            </Text>
            <Text c="dimmed" size="sm">
              Authenticate before the extension renders the main surface.
            </Text>
          </Stack>

          <Badge
            color={isMockMode ? 'teal' : 'blue'}
            radius="xl"
            variant="light"
          >
            {isMockMode ? 'Mock ready' : 'Remote login'}
          </Badge>
        </Group>

        {loginMutation.isError ? (
          <Alert color="red" radius="lg" title="Login failed">
            {loginMutation.error.message}
          </Alert>
        ) : null}

        <TextInput
          autoComplete="username"
          label="Email"
          onChange={(event) => {
            const email = event.currentTarget.value;

            setFormState((current) => ({
              ...current,
              email,
            }));
          }}
          placeholder="you@example.com"
          required
          size={compact ? 'sm' : 'md'}
          value={formState.email}
        />

        <PasswordInput
          autoComplete="current-password"
          label="Password"
          onChange={(event) => {
            const password = event.currentTarget.value;

            setFormState((current) => ({
              ...current,
              password,
            }));
          }}
          placeholder="password"
          required
          size={compact ? 'sm' : 'md'}
          value={formState.password}
        />

        <Switch
          checked={isMockMode}
          color="teal"
          description="Enabled by default so the feature can be exercised without a backend."
          label="Use mock authentication"
          onChange={(event) => {
            const mode = event.currentTarget.checked ? 'mock' : 'remote';

            setFormState((current) => ({
              ...current,
              mode,
            }));
          }}
          size="md"
        />

        {isMockMode ? (
          <Alert color="teal" radius="lg" title="Serverless mode">
            Any non-empty email and password will authenticate. Use the password
            <Text component="span" fw={700}>
              {' '}
              wrong
            </Text>
            {' '}to force an error and verify failure handling.
          </Alert>
        ) : (
          <Stack gap="md">
            <TextInput
              description="Used as the origin for the fixed login path /api/auth/login."
              label="Server origin"
              onChange={(event) => {
                const apiBaseUrl = event.currentTarget.value;

                setFormState((current) => ({
                  ...current,
                  apiBaseUrl,
                }));
              }}
              placeholder="http://localhost:3000"
              required
              value={formState.apiBaseUrl}
            />

            <TextInput
              description="Fetched first with credentials included, then sent as X-CSRF-Token."
              label="CSRF endpoint"
              onChange={(event) => {
                const csrfPath = event.currentTarget.value;

                setFormState((current) => ({
                  ...current,
                  csrfPath,
                }));
              }}
              placeholder="/api/auth/csrf"
              required
              value={formState.csrfPath}
            />

            <Alert color="blue" radius="lg" title="Request flow">
              The extension will fetch a CSRF token from
              <Text component="span" fw={700}>
                {' '}
                {formState.csrfPath}
              </Text>
              {' '}and then POST credentials to
              <Text component="span" fw={700}>
                {' '}
                {authConfig.loginPath}
              </Text>
              .
            </Alert>
          </Stack>
        )}

          <Button
            fullWidth
            loading={loginMutation.isPending}
            radius="xl"
            size={compact ? 'sm' : 'md'}
            type="submit"
          >
            Sign in
          </Button>
        </Stack>
      </Paper>
    </form>
  );
}
