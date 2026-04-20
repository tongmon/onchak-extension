import type { FormEvent, ReactElement } from "react";
import {
  Alert,
  Button,
  NumberInput,
  Paper,
  Stack,
  TextInput,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { FeedbackState, PopupFormValues } from "../model/popup-home-form";

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
            <Alert color={feedback.color} radius="lg" title={feedback.title}>
              {feedback.message}
            </Alert>
          ) : null}

          <Button loading={isSubmitting} radius="md" type="submit">
            계산 하러 가기!
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
