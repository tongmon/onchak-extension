import { useEffect, useState, type ReactElement } from "react";
import { Box, Button, Paper, Stack, Text, Title } from "@mantine/core";
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
  isHttpUrl,
  normalizeNumberInput,
  stringifyFieldValue,
  type FeedbackState,
  type PopupFormValues,
} from "../model/popup-home-form";
import { PopupHomeFormCard } from "./popup-home-form-card";

/*

입출고비용 VAT -> 입출고 배송비 / 10
판매수수료 -> 쿠팡 물품 원가 * 판매 수수료
판매수수료 VAT -> 판매수수료 / 10
부가세 -> (판매가 - (판매가 / 1.1)) - (1688 원가 - (1688 원가 / 1.1)) - 입출고비용 VAT - 판매수수료 VAT
마진 -> 쿠팡 물품 원가 - 1688 원가 - 입출고 배송비 - 입출고비용 VAT - 판매수수료 - 판매수수료 VAT - 부가세
마진율 -> (마진 / 쿠팡 물품 원가) * 100
최소 광고 수익률 -> (11000 / 마진율) / 10000
최근 28일 조회수 -> 15일 물품 합계에서 평균
평균 가격 -> 12일 물품 가격에서 최대, 최소 거르고 평균
예상 월 판매량 -> 28일 조회수 * 0.03
예상 월 마진 -> 쿠팡 물품 원가 * 예상 월 판매량

*/

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
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      coupangProductCost: settings.coupangProductCost,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
      overseasShippingFee: settings.overseasShippingFee,
    }),
    validate: {
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
      coupangProductCost: (value) =>
        normalizeNumberInput(value) === null
          ? "쿠팡 상품 원가를 입력해주세요."
          : null,
      inboundOutboundShippingFee: (value) =>
        normalizeNumberInput(value) === null
          ? "입출고 배송비를 입력해주세요."
          : null,
      overseasShippingFee: (value) =>
        normalizeNumberInput(value) === null
          ? "Overseas shipping fee를 입력해주세요."
          : null,
    },
  });

  useEffect(() => {
    const nextValues = createInitialPopupFormValues({
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      coupangProductCost: settings.coupangProductCost,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
      overseasShippingFee: settings.overseasShippingFee,
    });
    const currentValues = form.getValues();

    if (
      currentValues.product1688Url === nextValues.product1688Url &&
      String(currentValues.salesCommission) ===
        String(nextValues.salesCommission) &&
      String(currentValues.coupangProductCost) ===
        String(nextValues.coupangProductCost) &&
      String(currentValues.inboundOutboundShippingFee) ===
        String(nextValues.inboundOutboundShippingFee) &&
      String(currentValues.overseasShippingFee) ===
        String(nextValues.overseasShippingFee)
    ) {
      return;
    }

    form.setInitialValues(nextValues);
    form.setValues(nextValues);
    form.resetDirty();
  }, [
    settings.product1688Url,
    settings.salesCommission,
    settings.coupangProductCost,
    settings.inboundOutboundShippingFee,
    settings.overseasShippingFee,
  ]);

  const handleCalculate = form.onSubmit(async (values) => {
    const salesCommission = normalizeNumberInput(values.salesCommission);
    const coupangProductCost = normalizeNumberInput(values.coupangProductCost);
    const inboundOutboundShippingFee = normalizeNumberInput(
      values.inboundOutboundShippingFee,
    );
    const overseasShippingFee = normalizeNumberInput(
      values.overseasShippingFee,
    );

    if (
      salesCommission === null ||
      coupangProductCost === null ||
      inboundOutboundShippingFee === null ||
      overseasShippingFee === null
    ) {
      setFeedback({
        color: "red",
        title: "입력 오류",
        message: "숫자 입력값을 다시 확인해주세요.",
      });
      return;
    }

    const normalizedValues = {
      product1688Url: values.product1688Url.trim(),
      salesCommission: stringifyFieldValue(values.salesCommission),
      coupangProductCost: stringifyFieldValue(values.coupangProductCost),
      inboundOutboundShippingFee: stringifyFieldValue(
        values.inboundOutboundShippingFee,
      ),
      overseasShippingFee: stringifyFieldValue(values.overseasShippingFee),
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

      console.log(
        "payload: " +
          JSON.stringify({
            "1688Url": normalizedValues.product1688Url,
            salesCommission,
            coupangProductCost,
            inboundOutboundShippingFee,
            overseasShippingFee,
            ...activeTabSnapshot,
          }),
      );

      const ret = await marginCalculationMutation.mutateAsync({
        authConfig: authStateQuery.data?.config ?? defaultAuthConfig,
        authSession: authStateQuery.data?.session ?? null,
        payload: {
          "1688Url": normalizedValues.product1688Url,
          salesCommission,
          coupangProductCost,
          inboundOutboundShippingFee,
          overseasShippingFee,
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
            <Title fw={600} order={4}>
              마진율 및 ROAS 계산
            </Title>
            <Text size="sm">계산에 필요한 필수 정보를 입력해주세요.</Text>
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
