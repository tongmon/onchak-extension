import type {
  AbrsCoupangLedgerDownload,
  AbrsCoupangLedgerDownloadRequest,
} from '@/shared/extension';
import {
  createDailySettlementWorkbookBytes,
  type DailySettlementPayload,
} from './abrs-daily-settlement-xlsx.ts';

export type AbrsCoupangSurface =
  | 'wing-inventory'
  | 'wing-sales'
  | 'ads-center'
  | 'wing'
  | 'unknown';

export interface AbrsCoupangPageSnapshot {
  href: string;
  title: string;
  surface: AbrsCoupangSurface;
}

interface DownloadableStatusResponse {
  status?: string;
  downloadIds?: Array<number | string>;
}

interface RequestAutoDownloadResponse {
  requestedDownloadId?: number | string;
  requestDownloadId?: number | string;
  requestId?: number | string;
}

interface ProductListDownloadRequest {
  requestType: 'VENDOR_INVENTORY_ITEM';
  selectedTypes: string[];
  comment: string;
  fileDescription: string;
  productSearchV2Condition: Record<string, unknown>;
}

interface ProductListDownloadItem {
  sellerRequestDownloadExcelId?: number | string;
  status?: string;
  fileDescription?: string;
}

interface ProductListDownloadListResponse {
  result?: ProductListDownloadItem[];
}

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ADS_LOGIN_REQUIRED_MESSAGE =
  'Coupang 광고센터 로그인 세션이 필요합니다. https://advertising.coupang.com/marketing/dashboard 를 연 뒤 로그인 상태를 확인해주세요.';

const INVENTORY_HEALTH_EXCEL_PATH =
  '/tenants/rfm-inventory/inventory-health-dashboard/excel-report';

const SALES_REQUEST_AUTO_DOWNLOAD_PATH =
  '/fcc/download-manager/request-auto-download';

const SALES_CHECK_DOWNLOADABLE_PATH =
  '/fcc/download-manager/check-downloadable';

const SALES_DOWNLOAD_PATH = '/fcc/download-manager/download';

const PRODUCT_LIST_REQUEST_TYPE = 'VENDOR_INVENTORY_ITEM';
const PRODUCT_LIST_VALIDATE_PATH =
  '/tenants/seller-web/excel/request/download/create/validate';
const PRODUCT_LIST_CREATE_PATH =
  '/tenants/seller-web/excel/request/download/create/vendor-inventory/all';
const PRODUCT_LIST_STATUS_PATH =
  '/tenants/seller-web/excel/request/download/list';
const PRODUCT_LIST_DOWNLOAD_PATH =
  '/tenants/seller-web/excel/request/download/file';
const PRODUCT_LIST_DOWNLOAD_POLL_ATTEMPTS = 90;

const ADS_REPORTING_GRAPHQL_PATH = '/marketing-reporting/v2/graphql';

const DAILY_SETTLEMENT_GRAPHQL_QUERY = `mutation ($startDate: Int!, $endDate: Int!, $settlementDomain: SettlementDomain!) {
  getDailySettlement(
    startDate: $startDate
    endDate: $endDate
    settlementDomain: $settlementDomain
  ) {
    summary {
      total {
        vendorName
        deliveredAdcost
        deliveredAdcostAfterCap
        promotionAdjustment
        billableAdjustment
        billableAmount
        totalFinalAmount
      }
      nonRod {
        domain
        deliveredAdcost
        deliveredAdcostAfterCap
        billableAmount
        promotionAdjustment
        billableAdjustment
        deliveredAdcostAdj
        deliveredAdcostAfterAdj
        vat
        totalFinalAmount
      }
      rod {
        domain
        deliveredAdcost
        deliveredAdcostAfterCap
        billableAmount
        promotionAdjustment
        billableAdjustment
        deliveredAdcostAdj
        deliveredAdcostAfterAdj
        vat
        totalFinalAmount
      }
      rocketGrowth {
        domain
        deliveredAdcost
        deliveredAdcostAfterCap
        billableAmount
        promotionAdjustment
        billableAdjustment
        deliveredAdcostAdj
        deliveredAdcostAfterAdj
        vat
        totalFinalAmount
      }
    }
    items {
      date
      type
      settlementDomain
      campaignId
      campaignName
      adType
      goalType
      deliveredAdcost
      deliveredAdcostAdj
      deliveredAdcostAfterAdj
      budgetAmount
      budgetType
      deliveredAdcostAfterCap
      billableAmount
    }
    subtotals {
      nonRod {
        date
        domain
        deliveredAdcost
        deliveredAdcostAfterCap
        deliveredAdcostAdj
        deliveredAdcostAfterAdj
        billableAmount
        promotionAdjustment
        billableAdjustment
        vat
        totalFinalAmount
        taxCode
      }
      rod {
        date
        domain
        deliveredAdcost
        deliveredAdcostAfterCap
        deliveredAdcostAdj
        deliveredAdcostAfterAdj
        billableAmount
        promotionAdjustment
        billableAdjustment
        vat
        totalFinalAmount
        taxCode
      }
      rocketGrowth {
        date
        domain
        deliveredAdcost
        deliveredAdcostAfterCap
        deliveredAdcostAdj
        deliveredAdcostAfterAdj
        billableAmount
        promotionAdjustment
        billableAdjustment
        vat
        totalFinalAmount
        taxCode
      }
    }
  }
}`;

interface DailySettlementGraphqlResponse {
  data?: {
    getDailySettlement?: DailySettlementPayload | null;
  };
  errors?: Array<{ message?: string }>;
}

function assertValidTargetDate(targetDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('장부 날짜 형식이 올바르지 않습니다.');
  }
}

function getCompactDate(targetDate: string): string {
  assertValidTargetDate(targetDate);

  return targetDate.replaceAll('-', '');
}

function isWingHost(hostname: string): boolean {
  return hostname === 'wing.coupang.com';
}

function isAdvertisingHost(hostname: string): boolean {
  return hostname === 'advertising.coupang.com';
}

function parseCookie(name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));

  return match ? decodeURIComponent(match[1]) : null;
}

function getCoupangVendorId(): string {
  const globalData = (
    window as Window &
      typeof globalThis & {
        __GLOBAL_DATA__?: { vendorId?: string | number | null };
        initialData?: { applicationData?: { vendorId?: string | number | null } };
      }
  ).__GLOBAL_DATA__;
  const initialData = (
    window as Window &
      typeof globalThis & {
        initialData?: { applicationData?: { vendorId?: string | number | null } };
      }
  ).initialData;
  const vendorId =
    globalData?.vendorId ?? initialData?.applicationData?.vendorId ?? parseCookie('sc_vid');

  if (vendorId === null || typeof vendorId === 'undefined' || String(vendorId).trim() === '') {
    throw new Error('Coupang Wing vendorId를 찾지 못했습니다. Wing에 다시 로그인해주세요.');
  }

  return String(vendorId);
}

function getCoupangAdsVendorId(): string {
  try {
    return getCoupangVendorId();
  } catch {
    const bodyText = document.body?.innerText ?? '';
    const match = bodyText.match(/업체코드\s*([A-Z0-9]+)/);

    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error('광고센터 업체코드를 찾지 못했습니다. 광고센터에 다시 로그인해주세요.');
}

export function createInventoryHealthExcelRequest(): Record<string, unknown> {
  return {
    paginationRequest: {
      pageSize: 10,
      pageNumber: 0,
      searchAfterSortValues: null,
    },
    hiddenStatus: 'VISIBLE',
  };
}

export function createSalesStatisticsAutoDownloadForm(
  targetDate: string,
  vendorId: string,
): URLSearchParams {
  const compactDate = getCompactDate(targetDate);
  const form = new URLSearchParams();

  form.append('type', 'SELLER_INTEL_SELLER_METRICS');
  form.append('comment', 'Sales Statistics');
  form.append('description', `Statistics-${compactDate}~${compactDate}`);
  form.append(
    'predicate',
    JSON.stringify({
      vendorId,
      dateFrom: targetDate,
      dateTo: targetDate,
      vendorItemName: null,
      vendorItemIds: null,
      category: null,
      category2: null,
      pageSize: 10,
      actionedOn: false,
      rfmFlag: true,
    }),
  );

  return form;
}

export function createProductListDownloadRequest(
  requestedAt = new Date(),
): ProductListDownloadRequest {
  const compactDate = [
    String(requestedAt.getFullYear()).slice(-2),
    String(requestedAt.getMonth() + 1).padStart(2, '0'),
    String(requestedAt.getDate()).padStart(2, '0'),
  ].join('');

  return {
    requestType: PRODUCT_LIST_REQUEST_TYPE,
    selectedTypes: [],
    comment: `가격_재고_판매상태 변경(${compactDate})`,
    fileDescription: `price_inventory_${compactDate}`,
    productSearchV2Condition: {
      searchKeywordType: 'ALL',
      searchKeywords: '',
      salesMethod: 'ALL',
      productStatus: ['ALL'],
      stockSearchType: 'ALL',
      shippingFeeSearchType: 'ALL',
      displayCategoryCodes: [],
      listingStartTime: null,
      listingEndTime: null,
      saleEndDateSearchType: 'ALL',
      bundledShippingSearchType: 'ALL',
      displayDeletedProduct: false,
      shippingMethod: 'ALL',
      exposureStatus: 'ALL',
      sortMethod: 'SORT_BY_ITEM_LEVEL_UNIT_SOLD',
      countPerPage: 50,
      page: 1,
      locale: 'ko_KR',
      coupangAttributeOptimized: false,
      upBundleSearchOption: 'ALL',
      exposureStatuses: [],
      qualityEnhanceTypes: [],
      totalCount: 0,
    },
  };
}

export function createDailySettlementGraphqlRequest(
  targetDate: string,
): Record<string, unknown> {
  const compactDate = Number(getCompactDate(targetDate));

  return {
    variables: {
      startDate: compactDate,
      endDate: compactDate,
      settlementDomain: 'SELLER',
    },
    query: DAILY_SETTLEMENT_GRAPHQL_QUERY,
  };
}

export function createDailySettlementWorkbookFileName(
  targetDate: string,
  vendorId: string,
): string {
  const compactDate = getCompactDate(targetDate);

  return `${vendorId}-dailySettlement-${compactDate}-${compactDate}.xlsx`;
}

export function extractFilenameFromContentDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match) {
    return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''));
  }

  const asciiMatch = contentDisposition.match(/filename=([^;]+)/i);

  return asciiMatch
    ? decodeURIComponent(asciiMatch[1].trim().replace(/^"|"$/g, ''))
    : null;
}

async function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function readResponseAsDownload(
  response: Response,
  fallbackFileName: string,
): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  if (!response.ok) {
    throw new Error(`Coupang 파일 다운로드 실패: ${response.status}`);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  return {
    fileName:
      extractFilenameFromContentDisposition(response.headers.get('Content-Disposition')) ??
      fallbackFileName,
    mimeType: blob.type || XLSX_MIME_TYPE,
    base64,
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function uint8ArrayToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return new Blob([copy.buffer as ArrayBuffer], { type });
}

async function downloadInventoryHealthFile(
  targetDate: string,
): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  void targetDate;

  const response = await fetch(INVENTORY_HEALTH_EXCEL_PATH, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify(createInventoryHealthExcelRequest()),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return readResponseAsDownload(
    response,
    `inventory_health_sku_info_${getCompactTimestamp(new Date())}.xlsx`,
  );
}

async function requestSalesStatisticsDownload(
  targetDate: string,
): Promise<string> {
  const vendorId = getCoupangVendorId();
  const response = await fetch(SALES_REQUEST_AUTO_DOWNLOAD_PATH, {
    method: 'POST',
    credentials: 'include',
    body: createSalesStatisticsAutoDownloadForm(targetDate, vendorId),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
  });

  if (!response.ok) {
    throw new Error(`판매 현황 Excel 생성 요청 실패: ${response.status}`);
  }

  const payload = (await response.json()) as RequestAutoDownloadResponse;
  const requestId =
    payload.requestedDownloadId ?? payload.requestDownloadId ?? payload.requestId;

  if (typeof requestId === 'undefined' || requestId === null) {
    throw new Error('판매 현황 Excel requestId를 찾지 못했습니다.');
  }

  return String(requestId);
}

async function waitForSalesStatisticsDownloadId(requestId: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const checkUrl = new URL(SALES_CHECK_DOWNLOADABLE_PATH, window.location.origin);
    checkUrl.searchParams.set('requestId', requestId);

    const response = await fetch(checkUrl, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`판매 현황 Excel 상태 확인 실패: ${response.status}`);
    }

    const payload = (await response.json()) as DownloadableStatusResponse;
    const downloadId = payload.downloadIds?.[0];

    if (payload.status === 'COMPLETED' && typeof downloadId !== 'undefined') {
      return String(downloadId);
    }

    await delay(3000);
  }

  throw new Error('판매 현황 Excel 생성이 제한 시간 안에 완료되지 않았습니다.');
}

async function downloadSalesStatisticsFile(
  targetDate: string,
): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  const compactDate = getCompactDate(targetDate);
  const requestId = await requestSalesStatisticsDownload(targetDate);
  const downloadId = await waitForSalesStatisticsDownloadId(requestId);
  const response = await fetch(`${SALES_DOWNLOAD_PATH}/${requestId}/${downloadId}`, {
    credentials: 'include',
  });

  return readResponseAsDownload(
    response,
    `Statistics-${compactDate}~${compactDate}_(0).xlsx`,
  );
}

async function requestProductListDownload(
  request: ProductListDownloadRequest,
): Promise<void> {
  const validationUrl = new URL(PRODUCT_LIST_VALIDATE_PATH, window.location.origin);
  validationUrl.searchParams.set('requestType', PRODUCT_LIST_REQUEST_TYPE);
  const validationResponse = await fetch(validationUrl, {
    credentials: 'include',
  });

  if (!validationResponse.ok) {
    throw new Error(`상품 리스트 Excel 요청 확인 실패: ${validationResponse.status}`);
  }

  const response = await fetch(PRODUCT_LIST_CREATE_PATH, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify(request),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`상품 리스트 Excel 생성 요청 실패: ${response.status}`);
  }
}

async function waitForProductListDownloadId(
  fileDescription: string,
): Promise<string> {
  for (
    let attempt = 0;
    attempt < PRODUCT_LIST_DOWNLOAD_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusUrl = new URL(PRODUCT_LIST_STATUS_PATH, window.location.origin);
    statusUrl.searchParams.set('requestType', PRODUCT_LIST_REQUEST_TYPE);
    statusUrl.searchParams.set('page', '1');
    statusUrl.searchParams.set('countPerPage', '10');
    const response = await fetch(statusUrl, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`상품 리스트 Excel 상태 확인 실패: ${response.status}`);
    }

    const payload = (await response.json()) as ProductListDownloadListResponse;
    const requestedItems = (payload.result ?? [])
      .filter((item) => item.fileDescription === fileDescription)
      .sort(
        (left, right) =>
          Number(right.sellerRequestDownloadExcelId ?? 0) -
          Number(left.sellerRequestDownloadExcelId ?? 0),
      );
    const latestItem = requestedItems[0];

    if (latestItem?.status === 'COMPLETED' && latestItem.sellerRequestDownloadExcelId) {
      return String(latestItem.sellerRequestDownloadExcelId);
    }

    if (latestItem?.status === 'FAILED') {
      throw new Error('상품 리스트 Excel 생성에 실패했습니다.');
    }

    await delay(2000);
  }

  throw new Error('상품 리스트 Excel 생성이 제한 시간 안에 완료되지 않았습니다.');
}

async function downloadProductListFile(): Promise<
  Omit<AbrsCoupangLedgerDownload, 'slot'>
> {
  const request = createProductListDownloadRequest();
  await requestProductListDownload(request);
  const downloadId = await waitForProductListDownloadId(request.fileDescription);
  const downloadUrl = new URL(PRODUCT_LIST_DOWNLOAD_PATH, window.location.origin);
  downloadUrl.searchParams.set('requestType', PRODUCT_LIST_REQUEST_TYPE);
  downloadUrl.searchParams.set('sellerRequestDownloadExcelId', downloadId);
  const response = await fetch(downloadUrl, {
    credentials: 'include',
  });

  return readResponseAsDownload(response, `${request.fileDescription}.xlsx`);
}

export function getDailySettlementFromGraphqlResponse(
  payload: unknown,
): DailySettlementPayload {
  const response = Array.isArray(payload)
    ? (payload[0] as DailySettlementGraphqlResponse | undefined)
    : (payload as DailySettlementGraphqlResponse);

  const errorMessage = response?.errors
    ?.map((error) => error.message)
    .filter(Boolean)
    .join(', ');

  if (errorMessage) {
    throw new Error(`광고비 정산 데이터 조회 실패: ${errorMessage}`);
  }

  const settlement = response?.data?.getDailySettlement ?? null;
  const hasRows =
    (settlement?.items?.length ?? 0) > 0 ||
    (settlement?.subtotals?.nonRod?.length ?? 0) > 0 ||
    (settlement?.subtotals?.rod?.length ?? 0) > 0 ||
    (settlement?.subtotals?.rocketGrowth?.length ?? 0) > 0;

  if (!settlement || !hasRows) {
    throw new Error('선택한 날짜의 광고비 정산 데이터가 없습니다.');
  }

  return settlement;
}

async function downloadDailySettlementFile(
  targetDate: string,
): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  if (window.location.pathname.toLowerCase().startsWith('/user/login')) {
    throw new Error(ADS_LOGIN_REQUIRED_MESSAGE);
  }

  const response = await fetch(ADS_REPORTING_GRAPHQL_PATH, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify([createDailySettlementGraphqlRequest(targetDate)]),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`광고비 정산 데이터 조회 실패: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(ADS_LOGIN_REQUIRED_MESSAGE);
  }

  const payload = await response.json().catch(() => {
    throw new Error(ADS_LOGIN_REQUIRED_MESSAGE);
  });
  const settlement = getDailySettlementFromGraphqlResponse(payload);
  const workbookBytes = createDailySettlementWorkbookBytes(settlement);
  const blob = uint8ArrayToBlob(workbookBytes, XLSX_MIME_TYPE);

  return {
    fileName: createDailySettlementWorkbookFileName(
      targetDate,
      getCoupangAdsVendorId(),
    ),
    mimeType: XLSX_MIME_TYPE,
    base64: await blobToBase64(blob),
  };
}

function getCompactTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

export function detectAbrsCoupangSurface(href: string): AbrsCoupangSurface {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return 'unknown';
  }

  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  if (
    hostname === 'advertising.coupang.com' ||
    hostname === 'ads.coupang.com'
  ) {
    return 'ads-center';
  }

  if (hostname !== 'wing.coupang.com') {
    return 'unknown';
  }

  if (pathname.includes('/inventory/health')) {
    return 'wing-inventory';
  }

  if (
    pathname.includes('/inventory/sales') ||
    pathname.includes('/sales/detail') ||
    pathname.includes('/sales')
  ) {
    return 'wing-sales';
  }

  return 'wing';
}

export function getAbrsCoupangPageSnapshot(): AbrsCoupangPageSnapshot {
  return {
    href: window.location.href,
    title: document.title,
    surface: detectAbrsCoupangSurface(window.location.href),
  };
}

export async function downloadAbrsCoupangLedgerFile(
  request: AbrsCoupangLedgerDownloadRequest,
): Promise<AbrsCoupangLedgerDownload> {
  assertValidTargetDate(request.targetDate);

  switch (request.slot) {
    case 'inventoryHealth':
      if (!isWingHost(window.location.hostname)) {
        throw new Error('재고 현황은 Coupang Wing 탭에서만 자동 가져오기를 실행할 수 있습니다.');
      }

      return {
        slot: request.slot,
        ...(await downloadInventoryHealthFile(request.targetDate)),
      };

    case 'salesStatistics':
      if (!isWingHost(window.location.hostname)) {
        throw new Error('판매 현황은 Coupang Wing 탭에서만 자동 가져오기를 실행할 수 있습니다.');
      }

      return {
        slot: request.slot,
        ...(await downloadSalesStatisticsFile(request.targetDate)),
      };

    case 'dailySettlement':
      if (!isAdvertisingHost(window.location.hostname)) {
        throw new Error('광고비 정산은 Coupang 광고센터 탭에서만 자동 가져오기를 실행할 수 있습니다.');
      }

      return {
        slot: request.slot,
        ...(await downloadDailySettlementFile(request.targetDate)),
      };

    case 'productList':
      if (!isWingHost(window.location.hostname)) {
        throw new Error('상품 리스트는 Coupang Wing 탭에서만 자동 가져오기를 실행할 수 있습니다.');
      }

      return {
        slot: request.slot,
        ...(await downloadProductListFile()),
      };

    default:
      throw new Error(`지원하지 않는 장부 파일 유형입니다: ${String(request.slot)}`);
  }
}
