import { useEffect, useState, type ReactElement } from "react";
import { Box, Button, Paper, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  defaultAuthConfig,
  useAuthStateQuery,
  useLogoutMutation,
} from "@/entities/auth";
import { useExtensionSettingsStore } from "@/entities/settings";
import {
  sendRuntimeMessage,
  type PopularSearchSnapshot,
} from "@/shared/extension";
import { ExtensionShell } from "@/shared/ui/extension-shell";
import { useRequestMarginCalculationMutation } from "../api/request-margin-calculation-mutation";
import {
  createInitialPopupFormValues,
  getPopupFeedbackState,
  getResponsePreview,
  normalizeNumberInput,
  stringifyFieldValue,
  type FeedbackState,
  type PopupFormValues,
  isHttpUrl,
} from "../model/popup-home-form";
import { PopupHomeFormCard } from "./popup-home-form-card";
import { PopupHomeHeaderActions } from "./popup-home-header-actions";
import { PopupHomeResponseCard } from "./popup-home-response-card";
import { PopupHomeSnapshotCard } from "./popup-home-snapshot-card";

export function PopupHomePage(): ReactElement {
  const authStateQuery = useAuthStateQuery();
  const settings = useExtensionSettingsStore((state) => state.settings);
  const updateSettings = useExtensionSettingsStore((state) => state.update);
  const logoutMutation = useLogoutMutation();
  const marginCalculationMutation = useRequestMarginCalculationMutation();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [parsedSnapshot, setParsedSnapshot] =
    useState<PopularSearchSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PopupFormValues>({
    mode: "uncontrolled",
    initialValues: createInitialPopupFormValues({
      coupangProductUrl: settings.coupangProductUrl,
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
    }),
    validate: {
      coupangProductUrl: (value) => {
        const trimmedValue = value.trim();

        if (!trimmedValue) {
          return "쿠팡 상품 URL을 입력해주세요.";
        }

        return isHttpUrl(trimmedValue)
          ? null
          : "올바른 쿠팡 상품 URL을 입력해주세요.";
      },
      product1688Url: (value) => {
        const trimmedValue = value.trim();

        if (!trimmedValue) {
          return "1688 상품 URL을 입력해주세요.";
        }

        return isHttpUrl(trimmedValue)
          ? null
          : "올바른 1688 상품 URL을 입력해주세요.";
      },
      salesCommission: (value) =>
        normalizeNumberInput(value) === null
          ? "판매 수수료를 입력해주세요."
          : null,
      inboundOutboundShippingFee: (value) =>
        normalizeNumberInput(value) === null
          ? "입출고 배송비를 입력해주세요."
          : null,
    },
  });

  useEffect(() => {
    const nextValues = createInitialPopupFormValues({
      coupangProductUrl: settings.coupangProductUrl,
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
    });
    const currentValues = form.getValues();

    if (
      currentValues.coupangProductUrl === nextValues.coupangProductUrl &&
      currentValues.product1688Url === nextValues.product1688Url &&
      String(currentValues.salesCommission) ===
        String(nextValues.salesCommission) &&
      String(currentValues.inboundOutboundShippingFee) ===
        String(nextValues.inboundOutboundShippingFee)
    ) {
      return;
    }

    form.setInitialValues(nextValues);
    form.setValues(nextValues);
    form.resetDirty();
  }, [
    settings.coupangProductUrl,
    settings.product1688Url,
    settings.salesCommission,
    settings.inboundOutboundShippingFee,
  ]);

  const handleCalculate = form.onSubmit(async (values) => {
    const salesCommission = normalizeNumberInput(values.salesCommission);
    const inboundOutboundShippingFee = normalizeNumberInput(
      values.inboundOutboundShippingFee,
    );

    if (salesCommission === null || inboundOutboundShippingFee === null) {
      setFeedback({
        color: "red",
        title: "입력 오류",
        message: "숫자 입력값을 다시 확인해주세요.",
      });
      return;
    }

    const normalizedValues = {
      coupangProductUrl: values.coupangProductUrl.trim(),
      product1688Url: values.product1688Url.trim(),
      salesCommission: stringifyFieldValue(values.salesCommission),
      inboundOutboundShippingFee: stringifyFieldValue(
        values.inboundOutboundShippingFee,
      ),
    };

    setIsSubmitting(true);
    setFeedback(null);
    setParsedSnapshot(null);
    marginCalculationMutation.reset();

    try {
      await updateSettings(normalizedValues);
      form.setInitialValues(normalizedValues);
      form.setValues(normalizedValues);
      form.resetDirty();

      const activeTabSnapshot = await sendRuntimeMessage({
        type: "page/get-active-tab-popular-search-data",
      });

      setParsedSnapshot(activeTabSnapshot);

      await marginCalculationMutation.mutateAsync({
        authConfig: authStateQuery.data?.config ?? defaultAuthConfig,
        authSession: authStateQuery.data?.session ?? null,
        payload: {
          coupangUrl: normalizedValues.coupangProductUrl,
          "1688Url": normalizedValues.product1688Url,
          salesCommission,
          inboundOutboundShippingFee,
          ...activeTabSnapshot,
        },
      });
    } catch (error) {
      setFeedback(getPopupFeedbackState(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  const responsePreview = getResponsePreview(marginCalculationMutation.data);
  const session = authStateQuery.data?.session;

  return (
    <Box mih="100dvh" px="md" py="md">
      <Stack
        gap={0}
        mih="calc(100dvh - var(--mantine-spacing-md) * 2)"
        h="100%"
        justify="center"
      >
        <Paper
          mb="md"
          p="md"
          radius="xl"
          shadow="sm"
          withBorder
          bg="transparent"
        >
          <Stack gap={0} h="100%" justify="center">
            <Text fw={600}>마진율 및 ROAS 계산</Text>
            <Text size="sm">계산을 위한 필수 정보를 입력해주세요.</Text>
            <Button
              size="20"
              fz="xs"
              w="30%"
              variant="outline"
              mt="xs"
              style={{ alignSelf: "center" }}
              loading={logoutMutation.isPending}
              onClick={() => {
                void logoutMutation.mutateAsync();
              }}
            >
              로그아웃
            </Button>
          </Stack>
        </Paper>
        <PopupHomeFormCard
          feedback={feedback}
          form={form}
          isSubmitting={isSubmitting}
          onSubmit={handleCalculate}
        />

        {
          // parsedSnapshot ? (
          // <PopupHomeSnapshotCard snapshot={parsedSnapshot} />
          // ) : null
        }

        {
          // marginCalculationMutation.data ? (
          // <PopupHomeResponseCard
          //   response={marginCalculationMutation.data}
          //   responsePreview={responsePreview}
          // />
          // ) : null
        }
      </Stack>
    </Box>
  );
}
