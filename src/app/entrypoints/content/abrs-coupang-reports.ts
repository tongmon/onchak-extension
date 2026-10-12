import type {
  AbrsCoupangLedgerDownload,
  AbrsCoupangLedgerDownloadRequest,
  AbrsLedgerDateRange,
} from '../../../shared/extension/messaging/contracts.ts';
import { resolveAbrsLedgerPeriod } from '../../../shared/extension/messaging/contracts.ts';
import { sendRuntimeMessage } from '../../../shared/extension/messaging/runtime.ts';
import { extractFilenameFromContentDisposition } from './abrs-coupang-page.ts';

// Request shapes verified against Wing's status-new/stores/ExcelModal modules
// and the Ads Center network requests on 2026-10-11. Never synthesize reports.
const SETTLEMENT_ROOT = '/tenants/rfm/v2/settlements';
const ADS_GRAPHQL = '/marketing-reporting/v2/graphql';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_POLL_ATTEMPTS = 90;
const REPORT_REQUEST_TIMEOUT_MS = 30_000;
const ORIGINAL_DOWNLOAD_TIMEOUT_MS = 60_000;
const REQUEST_ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

export const SETTLEMENT_REPORT_TYPES = {
  CATEGORY_TR: 'CATEGORY_TR',
  WAREHOUSING_SHIPPING: 'WAREHOUSING_SHIPPING',
  STORAGE_FEE: 'STORAGE_FEE',
  CRETURN_PICKUP_RESTOCKING: 'CRETURN_PICKUP_RESTOCKING',
  VRETURN_HANDLING: 'VRETURN_HANDLING',
  VRETURN_SHIPPING: 'VRETURN_SHIPPING',
  INVENTORY_COMPENSATION: 'INVENTORY_COMPENSATION',
  VALUE_ADDED_SERVICE_FEE: 'BARCODE_LABELING_FEE',
  PPIR: 'PPIR',
} as const;

interface SettlementStatus {
  settlementGroupKey?: string;
  settlementPeriodStartDate?: string;
  settlementPeriodEndDate?: string;
}

interface SettlementDownloadStatus {
  requestTime?: string | number;
  downloadStatus?: string;
  sellerReportType?: string;
}

interface AdReport {
  id: string;
  status?: string;
  isLargeReport?: boolean;
}

export function createSettlementStatusRequest(request: AbrsCoupangLedgerDownloadRequest) {
  const period = resolveAbrsLedgerPeriod(request);
  return {
    startDate: new Date(`${period.start}T00:00:00+09:00`).toISOString(),
    endDate: new Date(`${period.end}T00:00:00+09:00`).toISOString(),
    searchDateType: 'SALES',
  };
}

function settlementDateInKorea(value: unknown): string {
  const invalid = () => new Error('정산 건의 매출인식 기간이 없거나 올바르지 않습니다.');
  if (typeof value !== 'string') throw invalid();
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) throw invalid();
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) throw invalid();
  if (!match[2]) return match[1];
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) throw invalid();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw invalid();
  // Wing's timestamps are instants; its UI displays their calendar dates in Asia/Seoul (UTC+9).
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function selectSettlementGroups(rows: SettlementStatus[], period: AbrsLedgerDateRange): { key: string; start: string; end: string }[] {
  resolveAbrsLedgerPeriod({ targetDate: period.end, periodStart: period.start, periodEnd: period.end });
  if (!rows.length) throw new Error('선택 기간의 정산 건이 없습니다. 정산 미발행 상태를 확인해주세요.');
  const groups = new Map<string, { key: string; start: string; end: string }>();
  for (const row of rows) {
    const key = row?.settlementGroupKey;
    if (typeof key !== 'string' || !key.trim()) throw new Error('정산 건의 원본 그룹 키를 확인할 수 없습니다.');
    const start = settlementDateInKorea(row.settlementPeriodStartDate);
    const end = settlementDateInKorea(row.settlementPeriodEndDate);
    if (start > end) throw new Error('정산 건의 매출인식 시작일이 종료일보다 늦습니다.');
    const previous = groups.get(key);
    if (previous && (previous.start !== start || previous.end !== end)) {
      throw new Error('동일한 정산 그룹에 서로 다른 매출인식 기간이 있습니다.');
    }
    groups.set(key, { key, start, end });
  }
  if (groups.size > 64) throw new Error('정산 건이 64개를 초과합니다. 조회 기간을 줄여주세요.');
  const sorted = [...groups.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  if (sorted[0].start !== period.start || sorted[sorted.length - 1].end !== period.end) {
    throw new Error('정산 건의 시작·종료 기간이 선택한 조회 기간과 일치하지 않습니다.');
  }
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.start <= previous.end) {
      throw new Error('정산 건의 매출인식 기간이 겹칩니다. 월별·주별 정산 건의 중복 여부를 확인해주세요.');
    }
    const nextDay = new Date(Date.parse(`${previous.end}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    if (current.start !== nextDay) throw new Error('선택 기간 중 정산 건이 없는 날짜 구간이 있습니다.');
  }
  return sorted;
}

export function selectSettlementGroupKeys(rows: SettlementStatus[], period: AbrsLedgerDateRange): string[] {
  return selectSettlementGroups(rows, period).map(({ key }) => key);
}

export function createSettlementReportRequest(
  request: AbrsCoupangLedgerDownloadRequest,
  settlementGroupKeys: string[],
  requestTime: string,
) {
  const type = SETTLEMENT_REPORT_TYPES[request.slot as keyof typeof SETTLEMENT_REPORT_TYPES];
  if (!type) throw new Error('지원하지 않는 정산 리포트입니다.');
  return { sellerReportType: type, requestTime, settlementGroupKeys, locale: 'ko' };
}

export function createAdCampaignListRequest(request: AbrsCoupangLedgerDownloadRequest) {
  const period = resolveAbrsLedgerPeriod(request);
  return {
    operationName: 'GetCampaignListInBillboard',
    variables: {
      startDate: Number(period.start.replaceAll('-', '')),
      endDate: Number(period.end.replaceAll('-', '')),
      reportType: 'pa',
      rbacReportType: 'AD_REPORT',
    },
    query: `query GetCampaignListInBillboard($startDate: Int!, $endDate: Int!, $reportType: ReportType!, $rbacReportType: String) {
      getCampaignList(startDate: $startDate, endDate: $endDate, reportType: $reportType, rbacReportType: $rbacReportType) { id name }
    }`,
  };
}

export function createAdPerformanceReportRequest(
  request: AbrsCoupangLedgerDownloadRequest,
  campaignIds: string[],
) {
  const period = resolveAbrsLedgerPeriod(request);
  if (!campaignIds.length) throw new Error('조회 기간의 광고 캠페인이 없습니다. 광고센터에서 확인해주세요.');
  return {
    variables: {
      reportType: 'pa',
      startDate: Number(period.start.replaceAll('-', '')),
      endDate: Number(period.end.replaceAll('-', '')),
      dateGroup: 'daily',
      granularity: 'vendorItem',
      excludeIfNoClickCount: false,
      campaignIds: [...new Set(campaignIds)],
    },
    query: `mutation ($startDate: Int!, $endDate: Int!, $campaignIds: [ID], $reportType: ReportType!, $dateGroup: DateGroup!, $granularity: Granularity, $excludeIfNoClickCount: Boolean) {
      requestReport(data: {startDate: $startDate, endDate: $endDate, campaignIds: $campaignIds, reportType: $reportType, dateGroup: $dateGroup, granularity: $granularity, excludeIfNoClickCount: $excludeIfNoClickCount}) { id status isLargeReport }
    }`,
  };
}

function unwrap<T>(payload: unknown): T {
  const value = payload as { data?: unknown };
  return (value && typeof value === 'object' && 'data' in value ? value.data : payload) as T;
}

/** Includes response-body reads, so stalled JSON or XLSX streams cannot hang the batch. */
async function withCoupangReportTimeout<T>(
  request: AbrsCoupangLedgerDownloadRequest,
  phase: '요청' | '원본 다운로드',
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const kind = request.slot === 'adPerformance' ? '광고 성과' : `${request.slot} 정산`;
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

export function createCoupangReportRequestHeaders(path: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const url = new URL(path, location.origin);
  if (location.origin !== 'https://wing.coupang.com' || url.origin !== location.origin
    || !url.pathname.startsWith(`${SETTLEMENT_ROOT}/`)) return headers;

  // Match Wing's Axios client; read only the same-origin anti-CSRF cookie for this request.
  const cookie = typeof document === 'undefined' ? undefined : document.cookie.split(';').map((value) => value.trim())
    .find((value) => value.startsWith('XSRF-TOKEN='));
  let token = '';
  try { token = cookie ? decodeURIComponent(cookie.slice('XSRF-TOKEN='.length)) : ''; }
  catch { /* malformed cookies require a fresh normal Wing login */ }
  if (!token) throw new Error('쿠팡 Wing 정산 인증 토큰을 확인할 수 없습니다. Wing 탭을 새로고침하고 로그인 상태를 확인해주세요.');
  const random = crypto.getRandomValues(new Uint8Array(21));
  let requestId = '';
  for (const value of random) requestId += REQUEST_ID_ALPHABET[value & 63];
  return { ...headers, Accept: 'application/json, text/plain, */*', withCredentials: 'true',
    'X-Rfm-Portal2-Request-Id': requestId, 'X-XSRF-TOKEN': token };
}

async function post(path: string, payload: unknown, request: AbrsCoupangLedgerDownloadRequest): Promise<unknown> {
  return withCoupangReportTimeout(request, '요청', REPORT_REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await fetch(path, {
      method: 'POST', credentials: 'include', signal,
      headers: createCoupangReportRequestHeaders(path), body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`쿠팡이 요청을 거부했습니다(HTTP ${response.status}). Wing/광고센터에서 조회가 되는지 확인한 후 재시도해주세요.`);
      }
      throw new Error(`쿠팡 보고서 요청 실패(HTTP ${response.status})`);
    }
    if (/text\/html/i.test(response.headers.get('Content-Type') ?? '')) {
      throw new Error('쿠팡 로그인 또는 접근 제한 화면을 받았습니다. 해당 탭에서 로그인 상태를 확인해주세요.');
    }
    return response.json();
  });
}

async function graphql<T>(payload: unknown, request: AbrsCoupangLedgerDownloadRequest): Promise<T> {
  const result = await post(ADS_GRAPHQL, payload, request) as { data?: T; errors?: { message?: string }[] };
  if (result.errors?.length) throw new Error(result.errors.map((error) => error.message ?? '광고 보고서 오류').join(', '));
  if (!result.data) throw new Error('광고센터 응답에 보고서 데이터가 없습니다.');
  return result.data;
}

async function downloadOriginal(url: string, credentials: RequestCredentials, request: AbrsCoupangLedgerDownloadRequest) {
  return withCoupangReportTimeout(request, '원본 다운로드', ORIGINAL_DOWNLOAD_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, { credentials, signal });
    return readOriginal(response, request);
  });
}

async function pause() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

function hasZipEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b
    || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  // An EOCD record is 22 bytes plus a comment of at most 65,535 bytes.
  // The server separately validates the ZIP contents and workbook structure.
  const lowerBound = Math.max(4, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset--) {
    if (bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b
      || bytes[offset + 2] !== 0x05 || bytes[offset + 3] !== 0x06) continue;
    const commentLength = bytes[offset + 20] | (bytes[offset + 21] << 8);
    if (offset + 22 + commentLength === bytes.length) return true;
  }
  return false;
}

async function readOriginal(
  response: Response,
  request: AbrsCoupangLedgerDownloadRequest,
): Promise<AbrsCoupangLedgerDownload> {
  if (!response.ok) throw new Error(`쿠팡 원본 다운로드 실패(HTTP ${response.status})`);
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_FILE_BYTES) throw new Error('원본 파일이 비어 있거나 개별 업로드 한도 20MiB를 초과합니다.');
  if (/text\/html|application\/json/i.test(blob.type)) throw new Error('원본 Excel 대신 인증/오류 응답을 받았습니다.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!hasZipEnvelope(bytes)) {
    throw new Error('Excel 원본이 아닙니다. 광고 보고서가 10만 행을 넘으면 텍스트로 제공되므로 조회 기간을 줄여주세요.');
  }
  const fileName = extractFilenameFromContentDisposition(response.headers.get('Content-Disposition'));
  if (!fileName || !/\.xlsx$/i.test(fileName) || /[\\/\u0000]/.test(fileName)) {
    throw new Error('쿠팡 원본의 Excel 파일명을 확인할 수 없습니다. 다운로드 응답을 확인해주세요.');
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return { slot: request.slot, fileName, mimeType: blob.type || XLSX_MIME, base64: btoa(binary) };
}

async function collectSettlement(request: AbrsCoupangLedgerDownloadRequest) {
  const status = unwrap<{ settlementStatusReports?: SettlementStatus[] }>(
    await post(`${SETTLEMENT_ROOT}/status/api`, createSettlementStatusRequest(request), request),
  );
  if (!Array.isArray(status?.settlementStatusReports)) throw new Error('정산 목록 응답 형식이 변경되었습니다.');
  const groups = selectSettlementGroups(status.settlementStatusReports, resolveAbrsLedgerPeriod(request));
  const downloads: AbrsCoupangLedgerDownload[] = [];
  let previousRequestTime = 0;
  // Wing generates one original per settlement row. Preserve every row's source
  // file instead of assuming that an unverified multi-key request aggregates it.
  for (const group of groups) {
    previousRequestTime = Math.max(Date.now(), previousRequestTime + 1);
    const download = await collectSettlementGroup(request, group.key, String(previousRequestTime));
    downloads.push({ ...download, sourcePeriod: { start: group.start, end: group.end } });
  }
  return downloads;
}

async function collectSettlementGroup(request: AbrsCoupangLedgerDownloadRequest, key: string, requestTime: string) {
  const payload = createSettlementReportRequest(request, [key], requestTime);
  await post(`${SETTLEMENT_ROOT}/request-download/api`, payload, request);
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const list = unwrap<SettlementDownloadStatus[]>(await post(`${SETTLEMENT_ROOT}/download-list/api`, {
      requestTimeFrom: String(Number(requestTime) - 1000), requestTimeTo: String(Math.max(Date.now(), Number(requestTime))),
    }, request));
    if (!Array.isArray(list)) throw new Error('정산 다운로드 목록 형식이 변경되었습니다.');
    const item = list.find((candidate) => String(candidate.requestTime) === requestTime
      && candidate.sellerReportType === payload.sellerReportType);
    if (item?.downloadStatus === 'FAILED') throw new Error('쿠팡 정산 리포트 생성에 실패했습니다.');
    if (item?.downloadStatus === 'COMPLETED') {
      const download = unwrap<{ url?: string }>(await post(`${SETTLEMENT_ROOT}/download/api/v2`, { requestTime, locale: 'ko' }, request));
      if (!download.url) throw new Error('정산 원본 다운로드 URL이 없습니다.');
      const url = new URL(download.url, location.origin);
      if (url.protocol !== 'https:' || url.username || url.password
        || !/(^|\.)(coupang\.com|coupangcdn\.com|amazonaws\.com)$/.test(url.hostname)) {
        throw new Error('허용되지 않은 정산 다운로드 주소입니다.');
      }
      if (url.origin === location.origin) return downloadOriginal(url.href, 'include', request);
      return sendRuntimeMessage({
        type: 'abrs/download-coupang-original', payload: { slot: request.slot, url: url.href },
      });
    }
    await pause();
  }
  throw new Error('정산 리포트 생성 대기 시간이 초과되었습니다. 쿠팡 다운로드 목록을 확인 후 재시도해주세요.');
}

async function collectAdvertising(request: AbrsCoupangLedgerDownloadRequest) {
  const campaigns = await graphql<{ getCampaignList?: { id: string }[] }>(createAdCampaignListRequest(request), request);
  const ids = campaigns.getCampaignList?.map((campaign) => campaign.id) ?? [];
  const requested = await graphql<{ requestReport?: AdReport }>(createAdPerformanceReportRequest(request, ids), request);
  if (!requested.requestReport?.id) throw new Error('광고 보고서 요청 ID가 없습니다.');
  const reportId = requested.requestReport.id;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const list = await graphql<{ reportList?: { reports?: AdReport[] } }>({
      variables: { reportType: 'pa', page: 1, pageSize: 10, duration: 90, onlyScheduledReport: false },
      query: `query ($reportType: ReportType!, $page: Int!, $pageSize: Int!, $duration: Int!, $onlyScheduledReport: Boolean) {
        reportList(data: {reportType: $reportType, page: $page, pageSize: $pageSize, duration: $duration, onlyScheduledReport: $onlyScheduledReport}) { reports { id status isLargeReport } }
      }`,
    }, request);
    const report = list.reportList?.reports?.find((candidate) => candidate.id === reportId);
    if (report?.status === 'failed') throw new Error('쿠팡 광고 보고서 생성에 실패했습니다.');
    if (report?.status === 'completed') {
      return [await downloadOriginal(`/marketing-reporting/v2/api/excel-report?id=${encodeURIComponent(reportId)}`, 'include', request)];
    }
    await pause();
  }
  throw new Error('광고 보고서 생성 대기 시간이 초과되었습니다. 광고센터에서 생성 상태를 확인해주세요.');
}

export async function collectCoupangReports(request: AbrsCoupangLedgerDownloadRequest): Promise<AbrsCoupangLedgerDownload[]> {
  resolveAbrsLedgerPeriod(request);
  if (request.slot === 'adPerformance') {
    if (location.hostname !== 'advertising.coupang.com') throw new Error('로그인된 쿠팡 광고센터 탭이 필요합니다.');
    return collectAdvertising(request);
  }
  if (location.hostname !== 'wing.coupang.com') throw new Error('로그인된 쿠팡 Wing 탭이 필요합니다.');
  return collectSettlement(request);
}
