export type ExtensionColorScheme = "auto" | "light" | "dark";
export type ProductionCostCurrency = "cny" | "krw";

export const DEFAULT_EXCHANGE_RATE = 352;

export interface ExtensionSettings {
  colorScheme: ExtensionColorScheme;
  pageOverlayEnabled: boolean;
  productionCostCurrency: ProductionCostCurrency;
  productionCost: string;
  productUrl: string;
  productUrls: string[];
  salesCommission: string;
  coupangProductCost: string;
  inboundOutboundShippingFee: string;
  exchangeRate: string;
}

export interface ExtensionStorageSchema {
  settings: ExtensionSettings;
}

export const defaultExtensionSettings: ExtensionSettings = {
  colorScheme: "auto",
  pageOverlayEnabled: false,
  productionCostCurrency: "cny",
  productionCost: "",
  productUrl: "",
  productUrls: [],
  salesCommission: "10.8",
  coupangProductCost: "",
  inboundOutboundShippingFee: "",
  exchangeRate: String(DEFAULT_EXCHANGE_RATE),
};

export const defaultExtensionStorage: ExtensionStorageSchema = {
  settings: defaultExtensionSettings,
};

export function normalizeExtensionSettings(
  input?:
    (Partial<ExtensionSettings> & { overseasShippingFee?: unknown }) | null,
): ExtensionSettings {
  const productUrls = normalizeStoredProductUrls(
    input?.productUrls,
    input?.productUrl,
  );

  return {
    colorScheme:
      input?.colorScheme === "light" || input?.colorScheme === "dark"
        ? input.colorScheme
        : defaultExtensionSettings.colorScheme,
    pageOverlayEnabled:
      typeof input?.pageOverlayEnabled === "boolean"
        ? input.pageOverlayEnabled
        : defaultExtensionSettings.pageOverlayEnabled,
    productionCostCurrency:
      input?.productionCostCurrency === "krw"
        ? input.productionCostCurrency
        : defaultExtensionSettings.productionCostCurrency,
    productionCost:
      typeof input?.productionCost === "string"
        ? input.productionCost
        : defaultExtensionSettings.productionCost,
    productUrl: productUrls[0] ?? defaultExtensionSettings.productUrl,
    productUrls,
    salesCommission:
      typeof input?.salesCommission === "string" &&
      input.salesCommission.trim() !== ""
        ? input.salesCommission
        : defaultExtensionSettings.salesCommission,
    coupangProductCost:
      typeof input?.coupangProductCost === "string"
        ? input.coupangProductCost
        : defaultExtensionSettings.coupangProductCost,
    inboundOutboundShippingFee:
      typeof input?.inboundOutboundShippingFee === "string"
        ? input.inboundOutboundShippingFee
        : defaultExtensionSettings.inboundOutboundShippingFee,
    exchangeRate:
      typeof input?.exchangeRate === "string"
        ? input.exchangeRate
        : typeof input?.overseasShippingFee === "string" &&
            input.overseasShippingFee.trim() !== ""
          ? input.overseasShippingFee
          : defaultExtensionSettings.exchangeRate,
  };
}

function normalizeStoredProductUrls(
  value: unknown,
  legacyProductUrl: unknown,
): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof legacyProductUrl === "string"
      ? [legacyProductUrl]
      : [];

  return Array.from(
    new Set(
      candidates
        .filter(
          (candidate): candidate is string => typeof candidate === "string",
        )
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  );
}
