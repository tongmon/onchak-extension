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
  normalizeProductUrl,
  stringifyFieldValue,
  type FeedbackState,
  type PopupFormValues,
} from "../model/popup-home-form";
import {
  loadPopupMarginDraft,
  savePopupMarginDraft,
} from "../model/popup-margin-draft";
import { PopupHomeFormCard } from "./popup-home-form-card";
import { PopupMarginResultPage } from "./popup-margin-result-page";

export function PopupHomePage(): ReactElement {
  const settings = useExtensionSettingsStore((state) => state.settings);
  const settingsStatus = useExtensionSettingsStore((state) => state.status);
  const updateSettings = useExtensionSettingsStore((state) => state.update);
  const logoutMutation = useLogoutMutation();
  const [productionCostCurrency, setProductionCostCurrency] =
    useState<ProductionCostCurrency>(settings.productionCostCurrency);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [calculationResult, setCalculationResult] =
    useState<PopupMarginCalculationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);

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
    onValuesChange: (values) => {
      void savePopupMarginDraft(values).catch((error) => {
        setFeedback({
          color: "yellow",
          title: "입력값 저장 실패",
          message:
            error instanceof Error
              ? error.message
              : "마진율 계산기 입력값을 cache에 저장하지 못했습니다.",
        });
      });
    },
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
      productUrl: (value) =>
        !value.trim() || normalizeProductUrl(value) !== null
          ? null
          : "http 또는 https로 시작하는 원가 사이트 링크를 입력해주세요.",
    },
  });

  useEffect(() => {
    if (settingsStatus !== "ready") {
      return;
    }

    let active = true;
    const fallbackValues = createInitialPopupFormValues({
      productionCostCurrency: settings.productionCostCurrency,
      productionCost: settings.productionCost,
      productUrl: settings.productUrl,
      salesCommission: settings.salesCommission,
      coupangProductCost: settings.coupangProductCost,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
      exchangeRate: settings.exchangeRate,
    });

    void loadPopupMarginDraft(fallbackValues)
      .then((nextValues) => {
        if (!active) {
          return;
        }

        setProductionCostCurrency(nextValues.productionCostCurrency);
        form.setInitialValues(nextValues);
        form.setValues(nextValues);
        form.resetDirty();
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setFeedback({
          color: "yellow",
          title: "입력값 불러오기 실패",
          message:
            error instanceof Error
              ? error.message
              : "저장된 마진율 계산기 입력값을 불러오지 못했습니다.",
        });
      })
      .finally(() => {
        if (active) {
          setIsDraftReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [
    settingsStatus,
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
    const productUrl = normalizeProductUrl(values.productUrl);

    if (
      productionCost === null ||
      salesCommission === null ||
      coupangProductCost === null ||
      inboundOutboundShippingFee === null ||
      exchangeRate === null ||
      (values.productUrl.trim() && productUrl === null)
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
      productUrl: productUrl ?? "",
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
      await Promise.all([
        updateSettings({
          productionCostCurrency: normalizedValues.productionCostCurrency,
          productionCost: normalizedValues.productionCost,
          productUrl: normalizedValues.productUrl,
          salesCommission: normalizedValues.salesCommission,
          coupangProductCost: normalizedValues.coupangProductCost,
          inboundOutboundShippingFee:
            normalizedValues.inboundOutboundShippingFee,
          exchangeRate: normalizedValues.exchangeRate,
        }),
        savePopupMarginDraft(normalizedValues),
      ]);
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
            productUrl: normalizedValues.productUrl,
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
      await Promise.all([
        updateSettings({
          productionCostCurrency: defaultSavedValues.productionCostCurrency,
          productionCost: defaultSavedValues.productionCost,
          productUrl: defaultSavedValues.productUrl,
          salesCommission: defaultSavedValues.salesCommission,
          coupangProductCost: defaultSavedValues.coupangProductCost,
          inboundOutboundShippingFee:
            defaultSavedValues.inboundOutboundShippingFee,
          exchangeRate: defaultSavedValues.exchangeRate,
        }),
        savePopupMarginDraft(defaultFormValues),
      ]);
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
              마진율 계산기
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
          isSubmitting={isSubmitting || !isDraftReady}
          productionCostCurrency={productionCostCurrency}
          onProductionCostCurrencyChange={handleProductionCostCurrencyChange}
          onSubmit={handleCalculate}
        />
        <AbrsLedgerImportCard />
      </Stack>
    </Box>
  );
}
