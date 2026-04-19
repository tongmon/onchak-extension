import { useEffect, useState, useTransition, type ReactElement } from "react";
import {
  Alert,
  Anchor,
  Avatar,
  Box,
  Button,
  NumberInput,
  Paper,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useExtensionSettingsStore } from "@/entities/settings";
import MainLogo from "@/assets/images/logos/MainLogo.png";
import { useLogoutMutation } from "@/entities/auth";

interface PopupFormValues {
  coupangProductUrl: string;
  product1688Url: string;
  salesCommission: string;
  inboundOutboundShippingFee: string;
}

function createInitialValues(values: PopupFormValues): PopupFormValues {
  return {
    coupangProductUrl: values.coupangProductUrl,
    product1688Url: values.product1688Url,
    salesCommission: values.salesCommission,
    inboundOutboundShippingFee: values.inboundOutboundShippingFee,
  };
}

export function PopupHomePage(): ReactElement {
  const settings = useExtensionSettingsStore((state) => state.settings);
  const updateSettings = useExtensionSettingsStore((state) => state.update);
  const logoutMutation = useLogoutMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<PopupFormValues>({
    mode: "uncontrolled",
    initialValues: createInitialValues({
      coupangProductUrl: settings.coupangProductUrl,
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
    }),
    onValuesChange: () => {
      setHasChanges(form.isDirty());
    },
  });

  useEffect(() => {
    const nextValues = createInitialValues({
      coupangProductUrl: settings.coupangProductUrl,
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
    });

    form.setInitialValues(nextValues);
    form.setValues(nextValues);
    form.resetDirty();
    setHasChanges(false);
  }, [
    settings.coupangProductUrl,
    settings.product1688Url,
    settings.salesCommission,
    settings.inboundOutboundShippingFee,
  ]);

  const handleSubmit = form.onSubmit((values) => {
    startTransition(async () => {
      const trimmedValues = createInitialValues({
        coupangProductUrl: values.coupangProductUrl.trim(),
        product1688Url: values.product1688Url.trim(),
        salesCommission: values.salesCommission.trim(),
        inboundOutboundShippingFee: values.inboundOutboundShippingFee.trim(),
      });

      try {
        setErrorMessage(null);
        await updateSettings(trimmedValues);
        form.setInitialValues(trimmedValues);
        form.setValues(trimmedValues);
        form.resetDirty();
        setHasChanges(false);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "입력값을 저장하지 못했습니다.",
        );
      }
    });
  });

  return (
    <Box mih="100dvh" px="md" py="md">
      <Stack
        gap="0"
        justify="center"
        align="center"
        mih="calc(100dvh - var(--mantine-spacing-md) * 2)"
      >
        <Avatar src={MainLogo} size="lg" mb="xs" />
        <Title order={4}>환영합니다, 이경준님!</Title>
        <Button
          variant="subtle"
          onClick={() => {
            void logoutMutation.mutateAsync();
          }}
          loading={logoutMutation.isPending}
          size="xs"
          mt="xs"
          mb="lg"
        >
          로그아웃
        </Button>
        <Paper p="lg" radius="xl" shadow="sm" withBorder w="100%">
          <Stack gap="md">
            <TextInput
              key={form.key("coupangProductUrl")}
              autoComplete="off"
              disabled={isPending}
              label="쿠팡 상품 URL"
              placeholder="https://www.coupang.com/..."
              radius="md"
              type="url"
              {...form.getInputProps("coupangProductUrl")}
            />

            <TextInput
              key={form.key("product1688Url")}
              autoComplete="off"
              disabled={isPending}
              label="1688 상품 URL"
              placeholder="https://detail.1688.com/..."
              radius="md"
              type="url"
              {...form.getInputProps("product1688Url")}
            />

            <NumberInput
              key={form.key("salesCommission")}
              autoComplete="off"
              disabled={isPending}
              label="판매 수수료"
              placeholder="수수료 12.5%"
              radius="md"
              suffix="%"
              {...form.getInputProps("salesCommission")}
            />

            <NumberInput
              key={form.key("inboundOutboundShippingFee")}
              autoComplete="off"
              disabled={isPending}
              label="입출고 배송비"
              placeholder="배송비 8000"
              radius="md"
              suffix="₩"
              {...form.getInputProps("inboundOutboundShippingFee")}
            />

            {errorMessage ? (
              <Alert color="red" radius="lg" title="Apply failed">
                {errorMessage}
              </Alert>
            ) : null}
          </Stack>
        </Paper>
        <Button
          disabled={!hasChanges}
          loading={isPending}
          radius="md"
          onClick={() => handleSubmit}
          mt="lg"
        >
          마진률 계산
        </Button>
      </Stack>
    </Box>
  );
}
