import type { FormEvent, ReactElement } from "react";
import {
  Alert,
  Anchor,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { LoginFormValues } from "../model/login-form";

interface LoginPanelFormProps {
  compact: boolean;
  errorMessage: string | null;
  form: UseFormReturnType<LoginFormValues>;
  isMockMode: boolean;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LoginPanelForm({
  compact,
  errorMessage,
  form,
  isMockMode,
  isSubmitting,
  onSubmit,
}: LoginPanelFormProps): ReactElement {
  return (
    <form onSubmit={onSubmit} style={{ width: "100%" }}>
      <Paper
        p={compact ? "md" : "xl"}
        radius="xl"
        shadow="sm"
        w="100%"
        withBorder
      >
        <Stack align="center" gap="lg">
          {errorMessage ? (
            <Alert color="red" radius="lg" title="Login failed" w="100%">
              {errorMessage}
            </Alert>
          ) : null}

          <TextInput
            autoComplete="username"
            label="이메일"
            placeholder="you@example.com"
            size={compact ? "sm" : "md"}
            w="100%"
            withAsterisk
            {...form.getInputProps("email")}
          />

          <PasswordInput
            autoComplete="current-password"
            label="비밀번호"
            placeholder="password"
            size={compact ? "sm" : "md"}
            w="100%"
            withAsterisk
            {...form.getInputProps("password")}
          />

          <Anchor size="sm">비밀번호 재설정</Anchor>

          <Switch
            checked={isMockMode}
            color="teal"
            // description="백엔드가 없이 시작"
            label="Mock 사용"
            onChange={(event) => {
              form.setFieldValue(
                "mode",
                event.currentTarget.checked ? "mock" : "remote",
              );
            }}
            size="md"
          />

          <Button
            fullWidth
            loading={isSubmitting}
            radius="xl"
            size={compact ? "sm" : "md"}
            type="submit"
          >
            로그인
          </Button>
        </Stack>
      </Paper>
    </form>
  );
}
