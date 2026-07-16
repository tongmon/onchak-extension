import type {
  PopularItemSnapshot,
  PopularSearchSnapshot,
} from "@/shared/extension";
import type { ProductionCostCurrency } from "./popup-home-form";

export interface PopupMarginCalculationInputs {
  productionCostCurrency: ProductionCostCurrency;
  productionCost: number;
  productUrl: string;
  salesCommission: number;
  coupangProductCost: number;
  inboundOutboundShippingFee: number;
  exchangeRate: number;
}

export interface PopupMarginCalculationResult {
  searchKeyword: string;
  categories: string[];
  popularItemCount: number;
  priceSampleCount: number;
  trimmedPriceSampleCount: number;
  productionCostCurrency: ProductionCostCurrency;
  productionCost: number;
  productUrl: string;
  exchangeRate: number;
  product1688Cost: number;
  inboundOutboundShippingFeeVat: number;
  salesCommissionFee: number;
  salesCommissionFeeVat: number;
  valueAddedTax: number;
  margin: number;
  marginRate: number | null;
  minimumAdvertisingReturn: number | null;
  average28DayViews: number | null;
  averagePrice: number | null;
  expectedMonthlySales: number | null;
  expectedMonthlyMargin: number | null;
}

interface CreatePopupMarginCalculationResultParams {
  inputs: PopupMarginCalculationInputs;
  snapshot: PopularSearchSnapshot;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getViewsMidpoint(item: PopularItemSnapshot): number {
  return (item.views[0] + item.views[1]) / 2;
}

function getAverage28DayViews(
  popularItems: PopularItemSnapshot[],
): number | null {
  return average(
    popularItems.slice(0, 15).map((item) => getViewsMidpoint(item)),
  );
}

function getTrimmedAveragePrice(popularItems: PopularItemSnapshot[]): {
  averagePrice: number | null;
  priceSampleCount: number;
  trimmedPriceSampleCount: number;
} {
  const priceSample = popularItems
    .map((item) => item.cost)
    .filter((cost) => Number.isFinite(cost))
    .sort((left, right) => left - right)
    .slice(0, 12);
  const trimmedPriceSample =
    priceSample.length > 2 ? priceSample.slice(1, -1) : priceSample;

  return {
    averagePrice: average(trimmedPriceSample),
    priceSampleCount: priceSample.length,
    trimmedPriceSampleCount: trimmedPriceSample.length,
  };
}

function getUniqueCategories(popularItems: PopularItemSnapshot[]): string[] {
  return Array.from(
    new Set(
      popularItems
        .map((item) => item.category.trim())
        .filter((category) => category.length > 0),
    ),
  );
}

function divideOrNull(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  const value = numerator / denominator;

  return Number.isFinite(value) ? value : null;
}

export function createPopupMarginCalculationResult({
  inputs,
  snapshot,
}: CreatePopupMarginCalculationResultParams): PopupMarginCalculationResult {
  const product1688Cost =
    inputs.productionCostCurrency === "cny"
      ? inputs.exchangeRate * inputs.productionCost
      : inputs.productionCost;
  const inboundOutboundShippingFeeVat =
    inputs.inboundOutboundShippingFee * 0.1;
  const salesCommissionFee =
    inputs.coupangProductCost * (inputs.salesCommission / 100);
  const salesCommissionFeeVat = salesCommissionFee * 0.1;
  const valueAddedTax =
    inputs.coupangProductCost -
    inputs.coupangProductCost / 1.1 -
    (product1688Cost - product1688Cost / 1.1) -
    inboundOutboundShippingFeeVat -
    salesCommissionFeeVat;
  const margin =
    inputs.coupangProductCost -
    product1688Cost -
    inputs.inboundOutboundShippingFee -
    inboundOutboundShippingFeeVat -
    salesCommissionFee -
    salesCommissionFeeVat -
    valueAddedTax;
  const marginRateRatio = divideOrNull(margin, inputs.coupangProductCost);
  const marginRate = marginRateRatio === null ? null : marginRateRatio * 100;
  const advertisingReturnBase =
    marginRate === null ? null : divideOrNull(11000, marginRate);
  const minimumAdvertisingReturn =
    advertisingReturnBase === null ? null : advertisingReturnBase / 10000;
  const average28DayViews = getAverage28DayViews(snapshot.popularItems);
  const { averagePrice, priceSampleCount, trimmedPriceSampleCount } =
    getTrimmedAveragePrice(snapshot.popularItems);
  const expectedMonthlySales =
    average28DayViews === null ? null : average28DayViews * 0.03;
  const expectedMonthlyMargin =
    expectedMonthlySales === null
      ? null
      : inputs.coupangProductCost * expectedMonthlySales;

  return {
    searchKeyword: snapshot.searchKeyword,
    categories: getUniqueCategories(snapshot.popularItems),
    popularItemCount: snapshot.popularItems.length,
    priceSampleCount,
    trimmedPriceSampleCount,
    productionCostCurrency: inputs.productionCostCurrency,
    productionCost: inputs.productionCost,
    productUrl: inputs.productUrl,
    exchangeRate: inputs.exchangeRate,
    product1688Cost,
    inboundOutboundShippingFeeVat,
    salesCommissionFee,
    salesCommissionFeeVat,
    valueAddedTax,
    margin,
    marginRate,
    minimumAdvertisingReturn,
    average28DayViews,
    averagePrice,
    expectedMonthlySales,
    expectedMonthlyMargin,
  };
}
