import type { ReactElement } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { PopupMarginCalculationResult } from "../model/popup-margin-result";

interface PopupMarginResultPageProps {
  isLoggingOut: boolean;
  result: PopupMarginCalculationResult;
  onBack: () => void;
  onLogout: () => void;
}

interface MetricCardProps {
  description?: string;
  label: string;
  tone?: "default" | "primary";
  value: string;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatWon(value: number | null): string {
  return value === null ? "계산 불가" : `${formatNumber(value)}원`;
}

function formatCount(value: number | null): string {
  return value === null ? "계산 불가" : formatNumber(value);
}

function formatPercentPoint(value: number | null): string {
  return value === null ? "계산 불가" : `${formatNumber(value)}%`;
}

function formatRatioPercent(value: number | null): string {
  return value === null ? "계산 불가" : `${formatNumber(value * 100)}%`;
}

function MetricCard({
  description,
  label,
  tone = "default",
  value,
}: MetricCardProps): ReactElement {
  const primary = tone === "primary";

  return (
    <Paper
      bg={primary ? "teal.0" : undefined}
      p="sm"
      radius="md"
      shadow={primary ? "xs" : undefined}
      withBorder
    >
      <Stack gap={2}>
        <Text c="dimmed" fw={600} size="xs">
          {label}
        </Text>
        <Text c={primary ? "teal.9" : undefined} fw={700} size="lg">
          {value}
        </Text>
        {description ? (
          <Text c="dimmed" size="xs">
            {description}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}

export function PopupMarginResultPage({
  isLoggingOut,
  onBack,
  onLogout,
  result,
}: PopupMarginResultPageProps): ReactElement {
  return (
    <Box mih="100dvh" px="md" py="md">
      <Stack gap="md">
        <Paper p="md" radius="md" shadow="sm" withBorder>
          <Stack gap="sm">
            <Group align="flex-start" justify="space-between">
              <Stack gap={2}>
                <Title fw={600} order={4}>
                  계산 결과
                </Title>
                <Text c="dimmed" size="sm">
                  {result.searchKeyword}
                </Text>
              </Stack>
              <Badge color="teal" radius="sm" variant="light">
                {result.popularItemCount} items
              </Badge>
            </Group>

            <Group grow preventGrowOverflow={false}>
              <Button onClick={onBack} radius="md" variant="default">
                다시 입력
              </Button>
              <Button
                loading={isLoggingOut}
                onClick={onLogout}
                radius="md"
                variant="outline"
              >
                로그아웃
              </Button>
            </Group>
          </Stack>
        </Paper>

        <SimpleGrid cols={1} spacing="xs">
          <MetricCard
            label="마진"
            tone="primary"
            value={formatWon(result.margin)}
          />
          <MetricCard
            label="마진율"
            tone="primary"
            value={formatPercentPoint(result.marginRate)}
          />
          <MetricCard
            description="공식: (11000 / 마진율) / 10000"
            label="최소 광고 수익률"
            tone="primary"
            value={formatRatioPercent(result.minimumAdvertisingReturn)}
          />
        </SimpleGrid>

        <Divider />

        <SimpleGrid cols={1} spacing="xs">
          <MetricCard
            label="1688 원가"
            value={formatWon(result.product1688Cost)}
          />
          <MetricCard
            label="입출고비용 VAT"
            value={formatWon(result.inboundOutboundShippingFeeVat)}
          />
          <MetricCard
            label="판매수수료"
            value={formatWon(result.salesCommissionFee)}
          />
          <MetricCard
            label="판매수수료 VAT"
            value={formatWon(result.salesCommissionFeeVat)}
          />
          <MetricCard label="부가세" value={formatWon(result.valueAddedTax)} />
        </SimpleGrid>

        <Divider />

        <SimpleGrid cols={1} spacing="xs">
          <MetricCard
            description="popularItems 조회수 범위의 중간값 기준"
            label="28일 조회수"
            value={formatCount(result.average28DayViews)}
          />
          <MetricCard
            description={`낮은 가격순 ${result.priceSampleCount}개 중 ${result.trimmedPriceSampleCount}개 평균`}
            label="평균 가격"
            value={formatWon(result.averagePrice)}
          />
          <MetricCard
            label="예상 월 판매량"
            value={formatCount(result.expectedMonthlySales)}
          />
          <MetricCard
            label="예상 월 마진"
            value={formatWon(result.expectedMonthlyMargin)}
          />
        </SimpleGrid>
      </Stack>
    </Box>
  );
}
