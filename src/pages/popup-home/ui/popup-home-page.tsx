import { useEffect, useState, type ReactElement } from "react";
import { Box, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useLogoutMutation } from "@/entities/auth";
import {
  defaultExtensionSettings,
  type ProductionCostCurrency,
  useExtensionSettingsStore,
} from "@/entities/settings";
import { AbrsLedgerImportCard } from "@/pages/abrs-automation";
import { sendRuntimeMessage } from "@/shared/extension";
import {
  createPopupMarginCalculationResult,
  type PopupMarginCalculationResult,
} from "../model/popup-margin-result";
import {
  createInitialPopupFormValues,
  getAppliedExchangeRate,
  getPopupFeedbackState,
  isBlankNumberInput,
  normalizeExchangeRateInput,
  normalizeNumberInput,
  stringifyFieldValue,
  type FeedbackState,
  type PopupFormValues,
} from "../model/popup-home-form";
import { PopupHomeFormCard } from "./popup-home-form-card";
import { PopupMarginResultPage } from "./popup-margin-result-page";

export function PopupHomePage(): ReactElement {
  const settings = useExtensionSettingsStore((state) => state.settings);
  const updateSettings = useExtensionSettingsStore((state) => state.update);
  const logoutMutation = useLogoutMutation();
  const [productionCostCurrency, setProductionCostCurrency] =
    useState<ProductionCostCurrency>(settings.productionCostCurrency);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [calculationResult, setCalculationResult] =
    useState<PopupMarginCalculationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const form = useForm<PopupFormValues>({
    mode: "uncontrolled",
    initialValues: createInitialPopupFormValues({
      productionCostCurrency: settings.productionCostCurrency,
      productionCost: settings.productionCost,
      productUrl: settings.productUrl,
      salesCommission: settings.salesCommission,
      coupangProductCost: settings.coupangProductCost,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
      exchangeRate: settings.exchangeRate,
    }),
    validate: {
      productionCost: (value) =>
        normalizeNumberInput(value) === null
          ? "상품 매입 원가(소싱 원가)를 입력해주세요."
          : null,
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
      exchangeRate: (value) =>
        isBlankNumberInput(value) || normalizeExchangeRateInput(value) !== null
          ? null
          : "배송 대행지 적용 환율을 0보다 큰 숫자로 입력해주세요.",
    },
  });

  useEffect(() => {
    const nextValues = createInitialPopupFormValues({
      productionCostCurrency: settings.productionCostCurrency,
      productionCost: settings.productionCost,
      productUrl: settings.productUrl,
      salesCommission: settings.salesCommission,
      coupangProductCost: settings.coupangProductCost,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
      exchangeRate: settings.exchangeRate,
    });
    const currentValues = form.getValues();

    setProductionCostCurrency(nextValues.productionCostCurrency);

    if (
      currentValues.productionCostCurrency ===
        nextValues.productionCostCurrency &&
      String(currentValues.productionCost) ===
        String(nextValues.productionCost) &&
      currentValues.productUrl === nextValues.productUrl &&
      String(currentValues.salesCommission) ===
        String(nextValues.salesCommission) &&
      String(currentValues.coupangProductCost) ===
        String(nextValues.coupangProductCost) &&
      String(currentValues.inboundOutboundShippingFee) ===
        String(nextValues.inboundOutboundShippingFee) &&
      String(currentValues.exchangeRate) === String(nextValues.exchangeRate)
    ) {
      return;
    }

    form.setInitialValues(nextValues);
    form.setValues(nextValues);
    form.resetDirty();
  }, [
    settings.productionCostCurrency,
    settings.productionCost,
    settings.productUrl,
    settings.salesCommission,
    settings.coupangProductCost,
    settings.inboundOutboundShippingFee,
    settings.exchangeRate,
  ]);

  const handleCalculate = form.onSubmit(async (values) => {
    const productionCost = normalizeNumberInput(values.productionCost);
    const salesCommission = normalizeNumberInput(values.salesCommission);
    const coupangProductCost = normalizeNumberInput(values.coupangProductCost);
    const inboundOutboundShippingFee = normalizeNumberInput(
      values.inboundOutboundShippingFee,
    );
    const exchangeRate = isBlankNumberInput(values.exchangeRate)
      ? getAppliedExchangeRate(values.exchangeRate)
      : normalizeExchangeRateInput(values.exchangeRate);

    if (
      productionCost === null ||
      salesCommission === null ||
      coupangProductCost === null ||
      inboundOutboundShippingFee === null ||
      exchangeRate === null
    ) {
      setFeedback({
        color: "red",
        title: "입력 오류",
        message: "숫자 입력값을 다시 확인해주세요.",
      });
      return;
    }

    const normalizedValues = {
      productionCostCurrency: values.productionCostCurrency,
      productionCost: stringifyFieldValue(values.productionCost),
      productUrl: values.productUrl.trim(),
      salesCommission: stringifyFieldValue(values.salesCommission),
      coupangProductCost: stringifyFieldValue(values.coupangProductCost),
      inboundOutboundShippingFee: stringifyFieldValue(
        values.inboundOutboundShippingFee,
      ),
      exchangeRate: stringifyFieldValue(values.exchangeRate),
    };

    setIsSubmitting(true);
    setFeedback(null);
    setCalculationResult(null);

    try {
      await updateSettings(normalizedValues);
      form.setInitialValues(normalizedValues);
      form.setValues(normalizedValues);
      form.resetDirty();

      const activeTabSnapshot = await sendRuntimeMessage({
        type: "page/get-active-tab-popular-search-data",
      });

      setCalculationResult(
        createPopupMarginCalculationResult({
          inputs: {
            productionCostCurrency: values.productionCostCurrency,
            productionCost,
            productUrl: values.productUrl.trim(),
            salesCommission,
            coupangProductCost,
            inboundOutboundShippingFee,
            exchangeRate,
          },
          snapshot: activeTabSnapshot,
        }),
      );
    } catch (error) {
      setFeedback(getPopupFeedbackState(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleResetForm = async () => {
    const defaultSavedValues = {
      productionCostCurrency: defaultExtensionSettings.productionCostCurrency,
      productionCost: defaultExtensionSettings.productionCost,
      productUrl: defaultExtensionSettings.productUrl,
      salesCommission: defaultExtensionSettings.salesCommission,
      coupangProductCost: defaultExtensionSettings.coupangProductCost,
      inboundOutboundShippingFee:
        defaultExtensionSettings.inboundOutboundShippingFee,
      exchangeRate: defaultExtensionSettings.exchangeRate,
    };
    const defaultFormValues = createInitialPopupFormValues(defaultSavedValues);

    setIsResetting(true);
    setFeedback(null);
    setCalculationResult(null);

    try {
      await updateSettings(defaultSavedValues);
      setProductionCostCurrency(defaultFormValues.productionCostCurrency);
      form.setInitialValues(defaultFormValues);
      form.setValues(defaultFormValues);
      form.resetDirty();
    } catch (error) {
      setFeedback({
        color: "red",
        title: "초기화 실패",
        message:
          error instanceof Error
            ? error.message
            : "입력값을 초기화하지 못했습니다.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleProductionCostCurrencyChange = (
    value: ProductionCostCurrency,
  ) => {
    setProductionCostCurrency(value);
    form.setFieldValue("productionCostCurrency", value);
  };

  if (calculationResult) {
    return (
      <PopupMarginResultPage
        isLoggingOut={logoutMutation.isPending}
        result={calculationResult}
        onBack={() => {
          setCalculationResult(null);
        }}
        onLogout={() => {
          void logoutMutation.mutateAsync();
        }}
      />
    );
  }

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
            <Text size="sm">계산에 필요한 정보를 입력해주세요.</Text>
            <Group gap="xs" justify="center" mt="xs">
              <Button
                disabled={isSubmitting}
                fz="xs"
                loading={isResetting}
                onClick={() => {
                  void handleResetForm();
                }}
                size="xs"
                variant="default"
              >
                초기화
              </Button>
              <Button
                disabled={isSubmitting || isResetting}
                fz="xs"
                loading={logoutMutation.isPending}
                onClick={() => {
                  void logoutMutation.mutateAsync();
                }}
                size="xs"
                variant="outline"
              >
                로그아웃
              </Button>
            </Group>
          </Stack>
        </Paper>
        <PopupHomeFormCard
          feedback={feedback}
          form={form}
          isSubmitting={isSubmitting}
          productionCostCurrency={productionCostCurrency}
          onProductionCostCurrencyChange={handleProductionCostCurrencyChange}
          onSubmit={handleCalculate}
        />
        <AbrsLedgerImportCard />
      </Stack>
    </Box>
  );
}
