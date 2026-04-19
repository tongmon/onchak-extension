import { useEffect, type ReactElement } from "react";
import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  useLoginMutation,
  type AuthConfig,
  type AuthMode,
} from "@/entities/auth";
import MainLogo from "@/assets/images/logos/MainLogo.png";

interface LoginPanelProps {
  authConfig: AuthConfig;
  surface: "popup" | "options";
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
    email: "",
    password: "",
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
  const form = useForm<LoginFormState>({
    mode: "controlled",
    initialValues: createInitialFormState(authConfig),
    validate: {
      email: (value) =>
        value.trim().length === 0 ? "이메일을 입력해주세요." : null,
      password: (value) =>
        value.length === 0 ? "비밀번호를 입력해주세요." : null,
      apiBaseUrl: (value, values) =>
        values.mode === "remote" && value.trim().length === 0
          ? "Server origin is required"
          : null,
      csrfPath: (value, values) =>
        values.mode === "remote" && value.trim().length === 0
          ? "CSRF endpoint is required"
          : null,
    },
  });

  useEffect(() => {
    form.setValues((current) => ({
      ...current,
      mode: authConfig.mode,
      apiBaseUrl: authConfig.apiBaseUrl,
      csrfPath: authConfig.csrfPath,
    }));
  }, [authConfig.apiBaseUrl, authConfig.csrfPath, authConfig.mode]);

  const compact = surface === "popup";
  const isMockMode = form.values.mode === "mock";

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
        <Avatar src={MainLogo} size="xl" mb="xs" />
        <Title order={4} mb="xs">
          마진률 계산을 시작해볼까요?
        </Title>
        <Text mb="xl" size="sm">
          {"계정이 없으세요? "}
          <Anchor
            component="button"
            onClick={() => {
              // navigate("/registration");
            }}
          >
            계정 생성
          </Anchor>
        </Text>
        <form onSubmit={handleSubmit}>
          <Paper p={compact ? "md" : "xl"} radius="xl" shadow="sm" withBorder>
            <Stack gap="lg" align="center">
              {loginMutation.isError ? (
                <Alert color="red" radius="lg" title="Login failed">
                  {loginMutation.error.message}
                </Alert>
              ) : null}

              <TextInput
                autoComplete="username"
                label="이메일"
                placeholder="you@example.com"
                size={compact ? "sm" : "md"}
                withAsterisk
                w="100%"
                {...form.getInputProps("email")}
              />

              <PasswordInput
                autoComplete="current-password"
                label="비밀번호"
                placeholder="password"
                size={compact ? "sm" : "md"}
                withAsterisk
                w="100%"
                {...form.getInputProps("password")}
              />

              <Anchor size="sm">비밀번호 재설정</Anchor>

              <Switch
                checked={isMockMode}
                color="teal"
                description="Enabled by default so the feature can be exercised without a backend."
                label="Use mock authentication"
                onChange={(event) => {
                  form.setFieldValue(
                    "mode",
                    event.currentTarget.checked ? "mock" : "remote",
                  );
                }}
                size="md"
              />

              {
                //   isMockMode ? (
                //   <Alert color="teal" radius="lg" title="Serverless mode">
                //     Any non-empty email and password will authenticate. Use the
                //     password
                //     <Text component="span" fw={700}>
                //       {" "}
                //       wrong
                //     </Text>{" "}
                //     to force an error and verify failure handling.
                //   </Alert>
                // ) : (
                //   <Stack gap="md">
                //     <TextInput
                //       description="Used as the origin for the fixed login path /api/auth/login."
                //       label="Server origin"
                //       placeholder="http://localhost:3000"
                //       withAsterisk
                //       {...form.getInputProps("apiBaseUrl")}
                //     />
                //
                //     <TextInput
                //       description="Fetched first with credentials included, then sent as X-CSRF-Token."
                //       label="CSRF endpoint"
                //       placeholder="/api/auth/csrf"
                //       withAsterisk
                //       {...form.getInputProps("csrfPath")}
                //     />
                //
                //     <Alert color="blue" radius="lg" title="Request flow">
                //       The extension will fetch a CSRF token from
                //       <Text component="span" fw={700}>
                //         {" "}
                //         {form.values.csrfPath}
                //       </Text>{" "}
                //       and then POST credentials to
                //       <Text component="span" fw={700}>
                //         {" "}
                //         {authConfig.loginPath}
                //       </Text>
                //       .
                //     </Alert>
                //   </Stack>
                //   )
              }

              <Button
                fullWidth
                loading={loginMutation.isPending}
                radius="xl"
                size={compact ? "sm" : "md"}
                type="submit"
              >
                로그인
              </Button>
            </Stack>
          </Paper>
        </form>
      </Stack>
    </Box>
  );
}
