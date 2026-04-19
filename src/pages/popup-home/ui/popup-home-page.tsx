import { useEffect, useState, type ReactElement } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
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
import {
  useRequestMarginCalculationMutation,
  type MarginCalculationResponse,
} from "../api/request-margin-calculation-mutation";

interface PopupFormValues {
  coupangProductUrl: string;
  product1688Url: string;
  salesCommission: string | number;
  inboundOutboundShippingFee: string | number;
}

interface FeedbackState {
  color: "red" | "yellow";
  title: string;
  message: string;
}

const DEBUG_POPUP_HOME = true;

function logPopupHomeDebug(
  stage: string,
  details: Record<string, unknown>,
): void {
  if (!DEBUG_POPUP_HOME) {
    return;
  }

  console.info(`[Onchak][popup-home][${stage}]`, details);
}

function createInitialValues(values: {
  coupangProductUrl: string;
  product1688Url: string;
  salesCommission: string;
  inboundOutboundShippingFee: string;
}): PopupFormValues {
  return {
    coupangProductUrl: values.coupangProductUrl,
    product1688Url: values.product1688Url,
    salesCommission: values.salesCommission,
    inboundOutboundShippingFee: values.inboundOutboundShippingFee,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeNumberInput(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue.replace(/,/g, ""));

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

function stringifyFieldValue(value: string | number): string {
  return typeof value === "number" ? String(value) : value.trim();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatRange(range: [number, number], suffix = ""): string {
  return `${formatCurrency(range[0])} - ${formatCurrency(range[1])}${suffix}`;
}

function getFeedbackState(error: unknown): FeedbackState {
  const message =
    error instanceof Error
      ? error.message
      : "마진률 계산 요청을 처리하지 못했습니다.";

  if (
    message ===
    "인기상품 검색 결과 페이지가 아닙니다. 해당 화면에서 다시 시도해주세요."
  ) {
    return {
      color: "yellow",
      title: "페이지 확인 필요",
      message,
    };
  }

  if (message === "특정 정보를 찾을 수 없습니다.") {
    return {
      color: "yellow",
      title: "파싱 경고",
      message,
    };
  }

  return {
    color: "red",
    title: "계산 요청 실패",
    message,
  };
}

function getResponsePreview(
  response: MarginCalculationResponse | undefined,
): string | null {
  if (!response) {
    return null;
  }

  return JSON.stringify(response, null, 2);
}

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
    initialValues: createInitialValues({
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
    const nextValues = createInitialValues({
      coupangProductUrl: settings.coupangProductUrl,
      product1688Url: settings.product1688Url,
      salesCommission: settings.salesCommission,
      inboundOutboundShippingFee: settings.inboundOutboundShippingFee,
    });

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
    logPopupHomeDebug("calculate-clicked", {
      values,
    });

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

      logPopupHomeDebug("active-tab-snapshot", {
        searchKeyword: activeTabSnapshot.searchKeyword,
        popularItemsCount: activeTabSnapshot.popularItems.length,
      });

      setParsedSnapshot(activeTabSnapshot);

      console.log(activeTabSnapshot);

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
      logPopupHomeDebug("calculate-failed", {
        errorMessage:
          error instanceof Error ? error.message : "Unknown popup-home error.",
      });
      setFeedback(getFeedbackState(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  const responsePreview = getResponsePreview(marginCalculationMutation.data);
  const session = authStateQuery.data?.session;

  return (
    <ExtensionShell
      actions={
        <Group gap="xs">
          <Badge color="teal" radius="xl" variant="light">
            {session?.user.email ?? "Authenticated"}
          </Badge>
          <Button
            loading={logoutMutation.isPending}
            onClick={() => {
              void logoutMutation.mutateAsync();
            }}
            radius="xl"
            size="xs"
            variant="default"
          >
            로그아웃
          </Button>
        </Group>
      }
      description="입력된 상품 URL과 현재 활성 탭의 인기상품 DOM 데이터를 합쳐 서버로 전송합니다."
      eyebrow="Popup"
      surface="popup"
      title="마진률 계산"
    >
      <form onSubmit={handleCalculate}>
        <Stack gap="lg">
          <Paper p="lg" radius="xl" shadow="sm" withBorder>
            <Stack gap="md">
              <TextInput
                key={form.key("coupangProductUrl")}
                autoComplete="off"
                disabled={isSubmitting}
                label="쿠팡 상품 URL"
                placeholder="https://www.coupang.com/..."
                radius="md"
                type="url"
                {...form.getInputProps("coupangProductUrl")}
              />

              <TextInput
                key={form.key("product1688Url")}
                autoComplete="off"
                disabled={isSubmitting}
                label="1688 상품 URL"
                placeholder="https://detail.1688.com/..."
                radius="md"
                type="url"
                {...form.getInputProps("product1688Url")}
              />

              <NumberInput
                key={form.key("salesCommission")}
                allowNegative={false}
                autoComplete="off"
                decimalScale={2}
                disabled={isSubmitting}
                label="판매 수수료"
                placeholder="예: 11.5"
                radius="md"
                suffix="%"
                thousandSeparator=","
                {...form.getInputProps("salesCommission")}
              />

              <NumberInput
                key={form.key("inboundOutboundShippingFee")}
                allowNegative={false}
                autoComplete="off"
                disabled={isSubmitting}
                label="입출고 배송비"
                placeholder="예: 1500"
                radius="md"
                suffix="원"
                thousandSeparator=","
                {...form.getInputProps("inboundOutboundShippingFee")}
              />

              {feedback ? (
                <Alert
                  color={feedback.color}
                  radius="lg"
                  title={feedback.title}
                >
                  {feedback.message}
                </Alert>
              ) : null}

              <Button loading={isSubmitting} radius="md" type="submit">
                마진률 계산
              </Button>
            </Stack>
          </Paper>

          {parsedSnapshot ? (
            <Paper p="lg" radius="xl" shadow="sm" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={700}>파싱된 인기상품 정보</Text>
                  <Badge color="teal" radius="xl" variant="light">
                    {parsedSnapshot.popularItems.length} items
                  </Badge>
                </Group>
                <Text size="sm">
                  검색어: <strong>{parsedSnapshot.searchKeyword}</strong>
                </Text>
                <Text c="dimmed" size="sm">
                  평균가 {formatCurrency(parsedSnapshot.averageCost)}원
                </Text>
                <Text c="dimmed" size="sm">
                  가격범위 {formatRange(parsedSnapshot.costRange, "원")}
                </Text>
              </Stack>
            </Paper>
          ) : null}

          {marginCalculationMutation.data ? (
            <Paper p="lg" radius="xl" shadow="sm" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={700}>서버 응답</Text>
                  <Badge color="cyan" radius="xl" variant="light">
                    excelRate {marginCalculationMutation.data.excelRate}
                  </Badge>
                </Group>
                <Text c="dimmed" size="sm">
                  excelEx: {marginCalculationMutation.data.excelEx}
                </Text>
                <Text c="dimmed" size="sm">
                  finalResult:{" "}
                  {marginCalculationMutation.data.finalResult.join(", ")}
                </Text>
                {responsePreview ? <Code block>{responsePreview}</Code> : null}
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </form>
    </ExtensionShell>
  );
}
