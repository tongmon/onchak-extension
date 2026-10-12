import {
  resolveAbrsLedgerPeriod,
  type AbrsCoupangLedgerDownload,
  type AbrsCoupangLedgerDownloadRequest,
} from '../../../shared/extension/messaging/contracts.ts';
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
  sellerId?: string;
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

// Statistics 원본 UI 경로: 로켓그로스 > 재고현황 > 기간 선택 > 자세히 보기 > 전체 상품목록 엑셀 다운로드.
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
const CORE_REQUEST_TIMEOUT_MS = 30_000;
const CORE_ORIGINAL_TIMEOUT_MS = 60_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SALES_GENERATION_TIMEOUT_MS = 90_000;
const PRODUCT_GENERATION_TIMEOUT_MS = 180_000;

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
  resolveAbrsLedgerPeriod({ targetDate });
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
  periodEnd = targetDate,
): URLSearchParams {
  const compactDate = getCompactDate(targetDate);
  const compactEndDate = getCompactDate(periodEnd);
  resolveAbrsLedgerPeriod({ targetDate, periodEnd });
  const form = new URLSearchParams();

  form.append('type', 'SELLER_INTEL_SELLER_METRICS');
  form.append('comment', 'Sales Statistics');
  form.append('description', `Statistics-${compactDate}~${compactEndDate}`);
  form.append(
    'predicate',
    JSON.stringify({
      vendorId,
      dateFrom: targetDate,
      dateTo: periodEnd,
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
  periodEnd = targetDate,
): Record<string, unknown> {
  const compactDate = Number(getCompactDate(targetDate));
  resolveAbrsLedgerPeriod({ targetDate, periodEnd });

  return {
    variables: {
      startDate: compactDate,
      endDate: Number(getCompactDate(periodEnd)),
      settlementDomain: 'SELLER',
    },
    query: DAILY_SETTLEMENT_GRAPHQL_QUERY,
  };
}

export function createDailySettlementWorkbookFileName(
  targetDate: string,
  vendorId: string,
  periodEnd = targetDate,
): string {
  const compactDate = getCompactDate(targetDate);

  return `${vendorId}-dailySettlement-${compactDate}-${getCompactDate(periodEnd)}.xlsx`;
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

async function withCoreRequestDeadline<T>(
  kind: '재고 현황' | '판매 현황' | '상품 리스트',
  phase: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${kind} ${phase} 시간이 ${timeoutMs / 1000}초를 초과했습니다. 해당 파일을 다시 가져와주세요.`);
      error.name = 'TimeoutError';
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (typeof timer !== 'undefined') clearTimeout(timer);
  }
}

async function readResponseAsDownload(
  response: Response,
  fallbackFileName: string,
): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  if (!response.ok) {
    throw new Error(`Coupang 파일 다운로드 실패: ${response.status}`);
  }

  const blob = await response.blob();
  if (!blob.size || /text\/html|application\/json/i.test(blob.type)) {
    throw new Error('Coupang에서 Excel 파일 대신 빈 응답 또는 인증 안내를 받았습니다. 로그인 상태를 확인해주세요.');
  }
  if (blob.size > MAX_FILE_BYTES) throw new Error('Excel 원본이 개별 업로드 한도 20MiB를 초과합니다.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!hasZipEnvelope(bytes)) throw new Error('Coupang 응답이 Excel 원본 형식이 아닙니다. 해당 파일을 다시 가져와주세요.');
  const fileName = extractFilenameFromContentDisposition(response.headers.get('Content-Disposition')) ?? fallbackFileName;
  if (!/\.xlsx$/i.test(fileName) || /[\\/\u0000]/.test(fileName)) throw new Error('Coupang Excel 원본 파일명을 확인할 수 없습니다.');
  const base64 = await blobToBase64(blob);

  return {
    fileName,
    mimeType: blob.type || XLSX_MIME_TYPE,
    base64,
  };
}

function hasZipEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b
    || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  for (let offset = bytes.length - 22; offset >= Math.max(4, bytes.length - 65557); offset--) {
    if (bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b
      || bytes[offset + 2] !== 0x05 || bytes[offset + 3] !== 0x06) continue;
    const commentLength = bytes[offset + 20] | (bytes[offset + 21] << 8);
    if (offset + 22 + commentLength === bytes.length) return true;
  }
  return false;
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
  return withCoreRequestDeadline('재고 현황', 'Excel 원본 다운로드', CORE_ORIGINAL_TIMEOUT_MS, async (signal) => {
    const response = await fetch(INVENTORY_HEALTH_EXCEL_PATH, {
      method: 'POST', credentials: 'include', signal,
      body: JSON.stringify(createInventoryHealthExcelRequest()),
      headers: { 'Content-Type': 'application/json' },
    });
    return readResponseAsDownload(response, `inventory_health_sku_info_${getCompactTimestamp(new Date())}.xlsx`);
  });
}

async function requestSalesStatisticsDownload(targetDate: string, periodEnd = targetDate, vendorId = getCoupangVendorId()): Promise<string> {
  return withCoreRequestDeadline('판매 현황', 'Excel 생성 요청', CORE_REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(SALES_REQUEST_AUTO_DOWNLOAD_PATH, {
      method: 'POST', credentials: 'include', signal,
      body: createSalesStatisticsAutoDownloadForm(targetDate, vendorId, periodEnd),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    });
    if (!response.ok) throw new Error(`판매 현황 Excel 생성 요청 실패: ${response.status}`);
    const payload = (await response.json()) as RequestAutoDownloadResponse;
    const requestId = payload.requestedDownloadId ?? payload.requestDownloadId ?? payload.requestId;
    if (typeof requestId === 'undefined' || requestId === null) throw new Error('판매 현황 Excel requestId를 찾지 못했습니다.');
    return String(requestId);
  });
}

async function waitForSalesStatisticsDownloadIds(requestId: string): Promise<string[]> {
  const deadline = Date.now() + SALES_GENERATION_TIMEOUT_MS;
  for (let attempt = 0; attempt < 30 && Date.now() < deadline; attempt += 1) {
    const checkUrl = new URL(SALES_CHECK_DOWNLOADABLE_PATH, window.location.origin);
    checkUrl.searchParams.set('requestId', requestId);
    const payload = await withCoreRequestDeadline('판매 현황', 'Excel 상태 확인',
      Math.min(CORE_REQUEST_TIMEOUT_MS, Math.max(1, deadline - Date.now())), async (signal) => {
        const response = await fetch(checkUrl, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`판매 현황 Excel 상태 확인 실패: ${response.status}`);
        return (await response.json()) as DownloadableStatusResponse;
      });
    if (payload.status === 'FAILED') throw new Error('판매 현황 Excel 생성에 실패했습니다. Wing 다운로드 목록에서 상태를 확인해주세요.');
    if (payload.status === 'COMPLETED') {
      if (!Array.isArray(payload.downloadIds) || !payload.downloadIds.length
        || payload.downloadIds.some((id) => (typeof id !== 'string' && typeof id !== 'number') || !String(id).trim())) {
        throw new Error('판매 현황 Excel 원본 다운로드 ID를 확인할 수 없습니다.');
      }
      return [...new Set(payload.downloadIds.map(String))];
    }
    await delay(Math.min(3000, Math.max(0, deadline - Date.now())));
  }
  throw new Error('판매 현황 Excel 생성이 제한 시간 안에 완료되지 않았습니다.');
}

async function downloadSalesStatisticsFiles(targetDate: string, periodEnd = targetDate): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>[]> {
  const files: Omit<AbrsCoupangLedgerDownload, 'slot'>[] = [];
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  // Statistics is aggregated over its requested range. Request each calendar day
  // separately so a month import preserves daily sales and overlaps a daily import safely.
  for (let timestamp = Date.parse(`${targetDate}T00:00:00Z`); timestamp <= end; timestamp += 86400000) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    try {
      files.push(...await downloadDailySalesStatisticsFiles(day));
    } catch (error) {
      const reason = error instanceof Error ? error.message : '판매 현황 Excel 수집 실패';
      throw new Error(`${day} 판매 현황을 가져오지 못했습니다. ${reason}`);
    }
  }
  return files;
}

async function downloadDailySalesStatisticsFiles(targetDate: string): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>[]> {
  const compactDate = getCompactDate(targetDate);
  const vendorId = getCoupangVendorId().trim().toUpperCase();
  const requestId = await requestSalesStatisticsDownload(targetDate, targetDate, vendorId);
  const downloadIds = await waitForSalesStatisticsDownloadIds(requestId);
  const files: Omit<AbrsCoupangLedgerDownload, 'slot'>[] = [];
  for (const [index, downloadId] of downloadIds.entries()) {
    files.push(await withCoreRequestDeadline('판매 현황', 'Excel 원본 다운로드', CORE_ORIGINAL_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`${SALES_DOWNLOAD_PATH}/${encodeURIComponent(requestId)}/${encodeURIComponent(downloadId)}`, { credentials: 'include', signal });
      return readResponseAsDownload(response, `Statistics-${compactDate}~${compactDate}_(${index}).xlsx`);
    }));
  }
  return files.map((file) => ({ ...file, ...(/^A\d{8}$/.test(vendorId) ? { sellerId: vendorId } : {}) }));
}

async function requestProductListDownload(request: ProductListDownloadRequest): Promise<void> {
  const validationUrl = new URL(PRODUCT_LIST_VALIDATE_PATH, window.location.origin);
  validationUrl.searchParams.set('requestType', PRODUCT_LIST_REQUEST_TYPE);
  await withCoreRequestDeadline('상품 리스트', 'Excel 요청 확인', CORE_REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(validationUrl, { credentials: 'include', signal });
    if (!response.ok) throw new Error(`상품 리스트 Excel 요청 확인 실패: ${response.status}`);
  });
  await withCoreRequestDeadline('상품 리스트', 'Excel 생성 요청', CORE_REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(PRODUCT_LIST_CREATE_PATH, {
      method: 'POST', credentials: 'include', signal, body: JSON.stringify(request), headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`상품 리스트 Excel 생성 요청 실패: ${response.status}`);
  });
}

async function getProductListDownloads(timeoutMs = CORE_REQUEST_TIMEOUT_MS): Promise<ProductListDownloadItem[]> {
  const statusUrl = new URL(PRODUCT_LIST_STATUS_PATH, window.location.origin);
  statusUrl.searchParams.set('requestType', PRODUCT_LIST_REQUEST_TYPE);
  statusUrl.searchParams.set('page', '1');
  statusUrl.searchParams.set('countPerPage', '10');
  const payload = await withCoreRequestDeadline('상품 리스트', 'Excel 상태 확인', timeoutMs, async (signal) => {
    const response = await fetch(statusUrl, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`상품 리스트 Excel 상태 확인 실패: ${response.status}`);
    return (await response.json()) as ProductListDownloadListResponse;
  });
  if (!Array.isArray(payload.result)) throw new Error('상품 리스트 Excel 다운로드 목록 형식이 변경되었습니다.');
  return payload.result;
}

async function waitForProductListDownloadId(fileDescription: string, existingIds: Set<string>): Promise<string> {
  const deadline = Date.now() + PRODUCT_GENERATION_TIMEOUT_MS;
  for (let attempt = 0; attempt < PRODUCT_LIST_DOWNLOAD_POLL_ATTEMPTS && Date.now() < deadline; attempt += 1) {
    const items = await getProductListDownloads(Math.min(CORE_REQUEST_TIMEOUT_MS, Math.max(1, deadline - Date.now())));
    const latestItem = items.filter((item) => item.fileDescription === fileDescription
      && item.sellerRequestDownloadExcelId != null && !existingIds.has(String(item.sellerRequestDownloadExcelId)))
      .sort((left, right) => Number(right.sellerRequestDownloadExcelId ?? 0) - Number(left.sellerRequestDownloadExcelId ?? 0))[0];
    if (latestItem?.status === 'COMPLETED' && latestItem.sellerRequestDownloadExcelId) return String(latestItem.sellerRequestDownloadExcelId);
    if (latestItem?.status === 'FAILED') throw new Error('상품 리스트 Excel 생성에 실패했습니다.');
    await delay(Math.min(2000, Math.max(0, deadline - Date.now())));
  }
  throw new Error('상품 리스트 Excel 생성이 제한 시간 안에 완료되지 않았습니다.');
}

async function downloadProductListFile(): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  const request = createProductListDownloadRequest();
  // Wing uses the same description for every request made today. A completed older
  // snapshot must never be mistaken for the report being generated by this run.
  const existingIds = new Set((await getProductListDownloads())
    .filter((item) => item.sellerRequestDownloadExcelId != null)
    .map((item) => String(item.sellerRequestDownloadExcelId)));
  await requestProductListDownload(request);
  const downloadId = await waitForProductListDownloadId(request.fileDescription, existingIds);
  const downloadUrl = new URL(PRODUCT_LIST_DOWNLOAD_PATH, window.location.origin);
  downloadUrl.searchParams.set('requestType', PRODUCT_LIST_REQUEST_TYPE);
  downloadUrl.searchParams.set('sellerRequestDownloadExcelId', downloadId);
  return withCoreRequestDeadline('상품 리스트', 'Excel 원본 다운로드', CORE_ORIGINAL_TIMEOUT_MS, async (signal) => {
    const response = await fetch(downloadUrl, { credentials: 'include', signal });
    return readResponseAsDownload(response, `${request.fileDescription}.xlsx`);
  });
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
  periodEnd = targetDate,
): Promise<Omit<AbrsCoupangLedgerDownload, 'slot'>> {
  if (window.location.pathname.toLowerCase().startsWith('/user/login')) {
    throw new Error(ADS_LOGIN_REQUIRED_MESSAGE);
  }

  const response = await fetch(ADS_REPORTING_GRAPHQL_PATH, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify([createDailySettlementGraphqlRequest(targetDate, periodEnd)]),
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
      periodEnd,
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
  let sellerId: string | undefined;
  if (window.location.hostname === 'wing.coupang.com') {
    try {
      const value = getCoupangVendorId().trim().toUpperCase();
      if (/^A\d{8}$/.test(value)) sellerId = value;
    } catch { /* Login and stale pages must not claim a verified seller. */ }
  }
  return {
    href: window.location.href,
    title: document.title,
    surface: detectAbrsCoupangSurface(window.location.href),
    ...(sellerId ? { sellerId } : {}),
  };
}

export async function downloadAbrsCoupangLedgerFile(
  request: AbrsCoupangLedgerDownloadRequest,
): Promise<AbrsCoupangLedgerDownload | AbrsCoupangLedgerDownload[]> {
  const period = resolveAbrsLedgerPeriod(request);

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

      return (await downloadSalesStatisticsFiles(period.start, period.end)).map((file) => ({
        slot: request.slot,
        ...file,
      }));

    case 'dailySettlement':
      if (!isAdvertisingHost(window.location.hostname)) {
        throw new Error('광고비 정산은 Coupang 광고센터 탭에서만 자동 가져오기를 실행할 수 있습니다.');
      }

      return {
        slot: request.slot,
        ...(await downloadDailySettlementFile(period.start, period.end)),
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
