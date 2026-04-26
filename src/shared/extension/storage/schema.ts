export type ExtensionColorScheme = "auto" | "light" | "dark";

export interface ExtensionSettings {
  colorScheme: ExtensionColorScheme;
  pageOverlayEnabled: boolean;
  product1688Url: string;
  salesCommission: string;
  coupangProductCost: string;
  inboundOutboundShippingFee: string;
  overseasShippingFee: string;
}

export interface ExtensionStorageSchema {
  settings: ExtensionSettings;
}

export const defaultExtensionSettings: ExtensionSettings = {
  colorScheme: "auto",
  pageOverlayEnabled: true,
  product1688Url: "",
  salesCommission: "10.8",
  coupangProductCost: "",
  inboundOutboundShippingFee: "",
  overseasShippingFee: "",
};

export const defaultExtensionStorage: ExtensionStorageSchema = {
  settings: defaultExtensionSettings,
};

export function normalizeExtensionSettings(
  input?: Partial<ExtensionSettings> | null,
): ExtensionSettings {
  return {
    colorScheme:
      input?.colorScheme === "light" || input?.colorScheme === "dark"
        ? input.colorScheme
        : defaultExtensionSettings.colorScheme,
    pageOverlayEnabled:
      typeof input?.pageOverlayEnabled === "boolean"
        ? input.pageOverlayEnabled
        : defaultExtensionSettings.pageOverlayEnabled,
    product1688Url:
      typeof input?.product1688Url === "string"
        ? input.product1688Url
        : defaultExtensionSettings.product1688Url,
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
    overseasShippingFee:
      typeof input?.overseasShippingFee === "string"
        ? input.overseasShippingFee
        : defaultExtensionSettings.overseasShippingFee,
  };
}
