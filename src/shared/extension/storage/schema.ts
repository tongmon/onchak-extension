export type ExtensionColorScheme = 'auto' | 'light' | 'dark';

export interface ExtensionSettings {
  colorScheme: ExtensionColorScheme;
  pageOverlayEnabled: boolean;
  coupangProductUrl: string;
  product1688Url: string;
  salesCommission: string;
  inboundOutboundShippingFee: string;
}

export interface ExtensionStorageSchema {
  settings: ExtensionSettings;
}

export const defaultExtensionSettings: ExtensionSettings = {
  colorScheme: 'auto',
  pageOverlayEnabled: true,
  coupangProductUrl: '',
  product1688Url: '',
  salesCommission: '',
  inboundOutboundShippingFee: '',
};

export const defaultExtensionStorage: ExtensionStorageSchema = {
  settings: defaultExtensionSettings,
};

export function normalizeExtensionSettings(
  input?: Partial<ExtensionSettings> | null,
): ExtensionSettings {
  return {
    colorScheme:
      input?.colorScheme === 'light' || input?.colorScheme === 'dark'
        ? input.colorScheme
        : defaultExtensionSettings.colorScheme,
    pageOverlayEnabled:
      typeof input?.pageOverlayEnabled === 'boolean'
        ? input.pageOverlayEnabled
        : defaultExtensionSettings.pageOverlayEnabled,
    coupangProductUrl:
      typeof input?.coupangProductUrl === 'string'
        ? input.coupangProductUrl
        : defaultExtensionSettings.coupangProductUrl,
    product1688Url:
      typeof input?.product1688Url === 'string'
        ? input.product1688Url
        : defaultExtensionSettings.product1688Url,
    salesCommission:
      typeof input?.salesCommission === 'string'
        ? input.salesCommission
        : defaultExtensionSettings.salesCommission,
    inboundOutboundShippingFee:
      typeof input?.inboundOutboundShippingFee === 'string'
        ? input.inboundOutboundShippingFee
        : defaultExtensionSettings.inboundOutboundShippingFee,
  };
}
