import type { FormEvent, ReactElement } from "react";
import {
  Alert,
  Anchor,
  Button,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { DEFAULT_EXCHANGE_RATE } from "@/entities/settings";
import type {
  FeedbackState,
  PopupFormValues,
  ProductionCostCurrency,
} from "../model/popup-home-form";

const COUPANG_FEE_INFORMATION_URL =
  "https://wing.coupang.com/tenants/rfm/settlements/fee-information?utm_source=winghome";
const PRODUCTION_COST_CURRENCY_OPTIONS: Array<{
  label: string;
  value: ProductionCostCurrency;
}> = [
  { label: "위안", value: "cny" },
  { label: "원화", value: "krw" },
];

interface PopupHomeFormCardProps {
  feedback: FeedbackState | null;
  form: UseFormReturnType<PopupFormValues>;
  isSubmitting: boolean;
  productionCostCurrency: ProductionCostCurrency;
  onProductionCostCurrencyChange: (value: ProductionCostCurrency) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PopupHomeFormCard({
  feedback,
  form,
  isSubmitting,
  productionCostCurrency,
  onProductionCostCurrencyChange,
  onSubmit,
}: PopupHomeFormCardProps): ReactElement {
  const productionCostSuffix =
    productionCostCurrency === "cny" ? "위안" : "원";
  const productionCostPlaceholder =
    productionCostCurrency === "cny" ? "예: 100" : "예: 35200";

  return (
    <Paper p="lg" radius="xl" shadow="sm" withBorder>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          <Stack gap={4}>
            <Text fw={500} size="sm">
              상품 매입 원가 통화
            </Text>
            <SegmentedControl<ProductionCostCurrency>
              data={PRODUCTION_COST_CURRENCY_OPTIONS}
              disabled={isSubmitting}
              fullWidth
              radius="md"
              size="sm"
              value={productionCostCurrency}
              onChange={onProductionCostCurrencyChange}
            />
          </Stack>

          <NumberInput
            key={form.key("productionCost")}
            allowNegative={false}
            autoComplete="off"
            decimalScale={2}
            disabled={isSubmitting}
            label="상품 매입 원가(소싱 원가)"
            placeholder={productionCostPlaceholder}
            radius="md"
            suffix={productionCostSuffix}
            thousandSeparator=","
            {...form.getInputProps("productionCost")}
          />

          <NumberInput
            key={form.key("salesCommission")}
            allowNegative={false}
            autoComplete="off"
            decimalScale={2}
            disabled={isSubmitting}
            label="판매 수수료"
            placeholder="예: 10.8"
            radius="md"
            suffix="%"
            thousandSeparator=","
            {...form.getInputProps("salesCommission")}
          />

          <NumberInput
            key={form.key("coupangProductCost")}
            allowNegative={false}
            autoComplete="off"
            disabled={isSubmitting}
            label="쿠팡 상품 판매가"
            placeholder="예: 12900"
            radius="md"
            suffix="원"
            thousandSeparator=","
            {...form.getInputProps("coupangProductCost")}
          />

          <NumberInput
            key={form.key("inboundOutboundShippingFee")}
            allowNegative={false}
            autoComplete="off"
            disabled={isSubmitting}
            label={
              <>
                {"입출고 배송비 ("}
                <Anchor
                  href={COUPANG_FEE_INFORMATION_URL}
                  inherit
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  rel="noreferrer"
                  target="_blank"
                >
                  바로가기
                </Anchor>
                {")"}
              </>
            }
            placeholder="예: 1500"
            radius="md"
            suffix="원"
            thousandSeparator=","
            {...form.getInputProps("inboundOutboundShippingFee")}
          />

          <NumberInput
            key={form.key("exchangeRate")}
            allowNegative={false}
            autoComplete="off"
            disabled={isSubmitting}
            description={`위안화 -> 원화, 비워두면 ${DEFAULT_EXCHANGE_RATE}원 적용`}
            label="배송 대행지 적용 환율"
            placeholder={`예: ${DEFAULT_EXCHANGE_RATE}`}
            radius="md"
            suffix="원"
            thousandSeparator=","
            {...form.getInputProps("exchangeRate")}
          />

          {feedback ? (
            <Alert color={feedback.color} radius="lg" title={feedback.title}>
              {feedback.message}
            </Alert>
          ) : null}

          <Button loading={isSubmitting} radius="md" type="submit">
            계산하러 가기
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
