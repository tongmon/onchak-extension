import type { FormEvent, ReactElement } from "react";
import {
  Alert,
  Anchor,
  Button,
  NumberInput,
  Paper,
  Stack,
  TextInput,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { FeedbackState, PopupFormValues } from "../model/popup-home-form";

const COUPANG_FEE_INFORMATION_URL =
  "https://wing.coupang.com/tenants/rfm/settlements/fee-information?utm_source=winghome";

interface PopupHomeFormCardProps {
  feedback: FeedbackState | null;
  form: UseFormReturnType<PopupFormValues>;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PopupHomeFormCard({
  feedback,
  form,
  isSubmitting,
  onSubmit,
}: PopupHomeFormCardProps): ReactElement {
  return (
    <Paper p="lg" radius="xl" shadow="sm" withBorder>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
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
            key={form.key("overseasShippingFee")}
            allowNegative={false}
            autoComplete="off"
            disabled={isSubmitting}
            label="배송대행지 적용 환율"
            placeholder="예: 3500"
            radius="md"
            suffix="원"
            thousandSeparator=","
            {...form.getInputProps("overseasShippingFee")}
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
