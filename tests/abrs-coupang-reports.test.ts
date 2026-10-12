import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectCoupangReports,
  createAdCampaignListRequest,
  createAdPerformanceReportRequest,
  createCoupangReportRequestHeaders,
  createSettlementReportRequest,
  createSettlementStatusRequest,
  selectSettlementGroupKeys,
} from '../src/app/entrypoints/content/abrs-coupang-reports.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';
import type { AbrsCoupangLedgerDownloadRequest } from '../src/shared/extension/messaging/contracts.ts';
import { downloadAbrsCoupangOriginal, validateAbrsCoupangOriginalRequest } from '../src/shared/extension/coupang-original-download.ts';

const settlementRoot = '/tenants/rfm/v2/settlements';
const graphqlPath = '/marketing-reporting/v2/graphql';
const requestedAt = 1791698400000;
const period = { targetDate: '2026-09-28', periodStart: '2026-09-01', periodEnd: '2026-09-28' };
const selectionPeriod = { start: period.periodStart, end: period.periodEnd };
const settlementRequest: AbrsCoupangLedgerDownloadRequest = { ...period, slot: 'CATEGORY_TR' };
const adRequest: AbrsCoupangLedgerDownloadRequest = { ...period, slot: 'adPerformance' };
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// An isolated unit-test workbook fixture. Production downloads must retain their original bytes.
const originalBytes = createDailySettlementWorkbookBytes({});

interface FetchStep {
  path: string;
  response: Response;
  body?: unknown;
  credentials?: RequestCredentials;
  onSignal?: (signal: AbortSignal) => void;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function settlementGroup(key: string, start = '2026-09-01', end = '2026-09-28') {
  return { settlementGroupKey: key, settlementPeriodStartDate: start, settlementPeriodEndDate: end };
}

function original(fileName: string, bytes = originalBytes, contentType = mime): Response {
  return new Response(bytes, {
    headers: { 'content-type': contentType, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` },
  });
}

async function withOriginalRelay<T>(url: string, fileResponse: Response, run: () => Promise<T>): Promise<T> {
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  let messages = 0;
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: { runtime: {
    sendMessage: async (message: { type: string; payload: { slot: AbrsCoupangLedgerDownloadRequest['slot']; url: string } }) => {
      messages += 1;
      assert.deepEqual(message, { type: 'abrs/download-coupang-original', payload: { slot: 'CATEGORY_TR', url } });
      validateAbrsCoupangOriginalRequest(message.payload, { id: 'unit-extension', url: 'https://wing.coupang.com/settlements',
        tab: { id: 1, url: 'https://wing.coupang.com/settlements' }, frameId: 0 }, 'unit-extension');
      try {
        const data = await downloadAbrsCoupangOriginal(message.payload, { fetch: async (input, init) => {
          assert.equal(String(input), url);
          assert.equal(init?.credentials, 'omit');
          assert.equal(init?.redirect, 'error');
          return fileResponse;
        } });
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Original failed' }; }
    },
  } } });
  try { return await run(); }
  finally {
    if (previousChrome) Object.defineProperty(globalThis, 'chrome', previousChrome);
    else Reflect.deleteProperty(globalThis, 'chrome');
    assert.equal(messages, 1);
  }
}

async function withRequests<T>(hostname: string, steps: FetchStep[], run: () => Promise<T>, cookie = 'unrelated=ignore; XSRF-TOKEN=unit%2Fxsrf%3Dvalue'): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalNow = Date.now;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname, origin: `https://${hostname}` } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie } });
  Date.now = () => requestedAt;
  let index = 0;
  globalThis.fetch = async (input, init) => {
    const step = steps[index++];
    assert.ok(step, `Unexpected request ${String(input)}`);
    assert.equal(String(input), step.path);
    assert.equal(init?.credentials, step.credentials ?? 'include');
    assert.ok(init?.signal instanceof AbortSignal, 'Every request must support cancellation');
    step.onSignal?.(init.signal);
    if (typeof step.body !== 'undefined') {
      assert.equal(init?.method, 'POST');
      if (hostname === 'wing.coupang.com' && step.path.startsWith(`${settlementRoot}/`)) {
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers['Content-Type'], 'application/json');
        assert.equal(headers.Accept, 'application/json, text/plain, */*');
        assert.equal(headers.withCredentials, 'true');
        assert.equal(headers['X-XSRF-TOKEN'], 'unit/xsrf=value');
        assert.match(headers['X-Rfm-Portal2-Request-Id'], /^[\w-]{21}$/);
      } else assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
      assert.deepEqual(JSON.parse(String(init?.body)), step.body);
    }
    return step.response;
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else Reflect.deleteProperty(globalThis, 'location');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    assert.equal(index, steps.length, 'Every expected request must be exercised');
  }
}

function settlementSteps(downloadUrl: string, fileResponse?: Response): FetchStep[] {
  const steps: FetchStep[] = [
    { path: `${settlementRoot}/status/api`, body: createSettlementStatusRequest(settlementRequest), response: json({ data: { settlementStatusReports: [settlementGroup('original-group'), settlementGroup('original-group')] } }) },
    { path: `${settlementRoot}/request-download/api`, body: { sellerReportType: 'CATEGORY_TR', requestTime: String(requestedAt), settlementGroupKeys: ['original-group'], locale: 'ko' }, response: json({ data: true }) },
    { path: `${settlementRoot}/download-list/api`, body: { requestTimeFrom: String(requestedAt - 1000), requestTimeTo: String(requestedAt) }, response: json({ data: [{ requestTime: String(requestedAt - 1), sellerReportType: 'CATEGORY_TR', downloadStatus: 'COMPLETED' }, { requestTime: String(requestedAt), sellerReportType: 'STORAGE_FEE', downloadStatus: 'COMPLETED' }, { requestTime: String(requestedAt), sellerReportType: 'CATEGORY_TR', downloadStatus: 'COMPLETED' }] }) },
    { path: `${settlementRoot}/download/api/v2`, body: { requestTime: String(requestedAt), locale: 'ko' }, response: json({ data: { url: downloadUrl } }) },
  ];
  if (fileResponse) steps.push({ path: downloadUrl, response: fileResponse, credentials: downloadUrl.startsWith('https://wing.coupang.com/') ? 'include' : 'omit' });
  return steps;
}

function adSteps(fileResponse: Response): FetchStep[] {
  return [
    { path: graphqlPath, body: createAdCampaignListRequest(adRequest), response: json({ data: { getCampaignList: [{ id: 'campaign-1' }, { id: 'campaign-2' }, { id: 'campaign-1' }] } }) },
    { path: graphqlPath, body: createAdPerformanceReportRequest(adRequest, ['campaign-1', 'campaign-2']), response: json({ data: { requestReport: { id: 'report/with?chars', status: 'pending' } } }) },
    { path: graphqlPath, response: json({ data: { reportList: { reports: [{ id: 'unrelated', status: 'completed' }, { id: 'report/with?chars', status: 'completed' }] } } }) },
    { path: '/marketing-reporting/v2/api/excel-report?id=report%2Fwith%3Fchars', response: fileResponse },
  ];
}

test('settlement status uses the captured SALES filter and Korea midnight in UTC', () => {
  assert.deepEqual(createSettlementStatusRequest(settlementRequest), {
    startDate: '2026-08-31T15:00:00.000Z', endDate: '2026-09-27T15:00:00.000Z', searchDateType: 'SALES',
  });
});

test('Wing settlement headers match its normal Axios request and decode only the named XSRF cookie', async () => {
  await withRequests('wing.coupang.com', [], async () => {
    const path = `${settlementRoot}/status/api`;
    const first = createCoupangReportRequestHeaders(path);
    assert.equal(first['X-XSRF-TOKEN'], 'unit/xsrf=value');
    assert.equal(first.Accept, 'application/json, text/plain, */*');
    assert.equal(first.withCredentials, 'true');
    assert.match(first['X-Rfm-Portal2-Request-Id'], /^[\w-]{21}$/);
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'OTHER-XSRF-TOKEN=wrong; XSRF-TOKEN=updated%3Dvalue%2B' } });
    const second = createCoupangReportRequestHeaders(`${settlementRoot}/download/api/v2`);
    assert.equal(second['X-XSRF-TOKEN'], 'updated=value+');
    assert.notEqual(second['X-Rfm-Portal2-Request-Id'], first['X-Rfm-Portal2-Request-Id']);
  });
});

test('missing, empty or malformed Wing XSRF cookies stop before any settlement API call', async () => {
  for (const cookie of ['', 'OTHER-XSRF-TOKEN=wrong', 'XSRF-TOKEN=', 'XSRF-TOKEN=%invalid']) {
    await assert.rejects(withRequests('wing.coupang.com', [], () => collectCoupangReports(settlementRequest), cookie), /정산 인증 토큰.*로그인 상태/);
  }
});

test('Wing XSRF headers are never read or forwarded to advertising, external hosts or unrelated paths', async () => {
  for (const hostname of ['wing.coupang.com', 'advertising.coupang.com']) {
    await withRequests(hostname, [], async () => {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: { get cookie() { assert.fail('Out-of-scope requests must not read cookies'); } } });
      const paths = ['https://example.com/tenants/rfm/v2/settlements/status/api', graphqlPath, '/tenants/rfm/v2/settlements-evil/status/api'];
      if (hostname === 'advertising.coupang.com') paths.push(`${settlementRoot}/status/api`);
      for (const path of paths) assert.deepEqual(createCoupangReportRequestHeaders(path), { 'Content-Type': 'application/json' });
    });
  }
});

test('all nine settlement request types match Wing, including its barcode-service alias', () => {
  const types = {
    CATEGORY_TR: 'CATEGORY_TR', WAREHOUSING_SHIPPING: 'WAREHOUSING_SHIPPING', STORAGE_FEE: 'STORAGE_FEE',
    CRETURN_PICKUP_RESTOCKING: 'CRETURN_PICKUP_RESTOCKING', VRETURN_HANDLING: 'VRETURN_HANDLING', VRETURN_SHIPPING: 'VRETURN_SHIPPING',
    INVENTORY_COMPENSATION: 'INVENTORY_COMPENSATION', VALUE_ADDED_SERVICE_FEE: 'BARCODE_LABELING_FEE', PPIR: 'PPIR',
  } as const;
  for (const [slot, sellerReportType] of Object.entries(types)) {
    assert.deepEqual(createSettlementReportRequest({ ...period, slot: slot as keyof typeof types }, ['group-a', 'group-b'], '123456'), {
      sellerReportType, requestTime: '123456', settlementGroupKeys: ['group-a', 'group-b'], locale: 'ko',
    });
  }
  assert.throws(() => createSettlementReportRequest(adRequest, ['group-a'], '123456'), /지원하지 않는/);
});

test('settlement selection sorts the five captured September weekly periods after Korea date normalization', () => {
  // Captured period/cycle/ratio fields only; original account and group identifiers are not fixtures.
  const rows = [
    ['2026-08-31T15:00:00Z', '2026-09-05T15:00:00Z'],
    ['2026-09-06T15:00:00Z', '2026-09-12T15:00:00Z'],
    ['2026-09-13T15:00:00Z', '2026-09-19T15:00:00Z'],
    ['2026-09-20T15:00:00Z', '2026-09-26T15:00:00Z'],
    ['2026-09-27T15:00:00Z', '2026-09-29T15:00:00Z'],
  ].map(([start, end], index) => ({ ...settlementGroup(`weekly-${index + 1}`, start, end), settlementCycle: 'WEEKLY', settlementRatio: 70 })).reverse();
  const originalRows = structuredClone(rows);
  assert.deepEqual(selectSettlementGroupKeys(rows, { start: '2026-09-01', end: '2026-09-30' }),
    ['weekly-1', 'weekly-2', 'weekly-3', 'weekly-4', 'weekly-5']);
  assert.deepEqual(rows, originalRows, 'Selection must not mutate the source rows');
});

test('identical source keys deduplicate by normalized periods while preserving their original value', () => {
  const key = ' original-group-key ';
  assert.deepEqual(selectSettlementGroupKeys([
    settlementGroup(key, '2026-08-31T08:00:00-07:00', '2026-09-27T15:00:00.000Z'),
    settlementGroup(key, '2026-09-01T00:00:00+09:00', '2026-09-28T00:00:00+09:00'),
    settlementGroup(key),
  ], selectionPeriod), [key]);
});

test('settlement selection rejects missing keys, missing periods and invalid or ambiguous dates', () => {
  for (const row of [
    {}, settlementGroup(''), settlementGroup('   '),
    { settlementGroupKey: 'group', settlementPeriodEndDate: '2026-09-28' },
    { settlementGroupKey: 'group', settlementPeriodStartDate: '2026-09-01' },
  ]) assert.throws(() => selectSettlementGroupKeys([row], selectionPeriod), /그룹 키|매출인식 기간/);
  for (const value of ['', '2026-02-30', '2026-09-31T00:00:00Z', '2026-09-01T00:00:00',
    '2026-09-01T24:00:00Z', '2026-09-01T00:60:00Z', '2026-09-01T00:00:60Z', '2026-09-01T00:00:00+99:00']) {
    assert.throws(() => selectSettlementGroupKeys([settlementGroup('group', value)], selectionPeriod), /매출인식 기간/);
  }
});

test('settlement selection rejects reversed periods and conflicting dates for a source key', () => {
  assert.throws(() => selectSettlementGroupKeys([settlementGroup('reversed', '2026-09-28', '2026-09-01')], selectionPeriod), /시작일이 종료일보다/);
  assert.throws(() => selectSettlementGroupKeys([
    settlementGroup('same-key', '2026-09-01', '2026-09-14'), settlementGroup('same-key', '2026-09-15'),
  ], selectionPeriod), /동일한 정산 그룹.*서로 다른/);
});

test('settlement selection rejects overlapping dates including monthly and weekly duplicates', () => {
  for (const rows of [
    [settlementGroup('weekly-1', '2026-09-01', '2026-09-14'), settlementGroup('weekly-2', '2026-09-14')],
    [settlementGroup('monthly'), settlementGroup('weekly-1', '2026-09-01', '2026-09-14'), settlementGroup('weekly-2', '2026-09-15')],
    [settlementGroup('payout-70'), settlementGroup('payout-30')],
  ]) assert.throws(() => selectSettlementGroupKeys(rows, selectionPeriod), /기간이 겹칩니다/);
});

test('settlement selection requires exact first and last dates and rejects internal gaps', () => {
  for (const [start, end] of [['2026-09-02', '2026-09-28'], ['2026-08-31', '2026-09-28'],
    ['2026-09-01', '2026-09-27'], ['2026-09-01', '2026-09-29']]) {
    assert.throws(() => selectSettlementGroupKeys([settlementGroup('group', start, end)], selectionPeriod), /조회 기간과 일치하지/);
  }
  assert.throws(() => selectSettlementGroupKeys([
    settlementGroup('weekly-1', '2026-09-01', '2026-09-14'), settlementGroup('weekly-2', '2026-09-16'),
  ], selectionPeriod), /정산 건이 없는 날짜 구간/);
});

test('settlement coverage handles leap days and year boundaries independently of the host timezone', () => {
  assert.deepEqual(selectSettlementGroupKeys([
    settlementGroup('leap', '2024-02-27T15:00:00Z', '2024-02-28T15:00:00Z'),
    settlementGroup('march', '2024-02-29T15:00:00Z', '2024-03-01'),
  ], { start: '2024-02-28', end: '2024-03-01' }), ['leap', 'march']);
  assert.deepEqual(selectSettlementGroupKeys([
    settlementGroup('new-year', '2026-12-31T15:00:00Z', '2027-01-01'),
    settlementGroup('year-end', '2026-12-30T15:00:00Z', '2026-12-31'),
  ], { start: '2026-12-31', end: '2027-01-01' }), ['year-end', 'new-year']);
});

test('settlement selection rejects empty or excessive groups without truncating the source list', () => {
  assert.throws(() => selectSettlementGroupKeys([], selectionPeriod), /정산 건이 없습니다/);
  assert.throws(() => selectSettlementGroupKeys(Array.from({ length: 65 }, (_, index) => settlementGroup(String(index))), selectionPeriod), /64개/);
});

test('invalid source coverage stops collection before any report generation request', async () => {
  for (const rows of [
    [{ settlementGroupKey: 'missing-period' }],
    [settlementGroup('partial', '2026-09-02')],
    [settlementGroup('monthly'), settlementGroup('weekly', '2026-09-15')],
    [settlementGroup('first', '2026-09-01', '2026-09-14'), settlementGroup('last', '2026-09-16')],
  ]) await assert.rejects(withRequests('wing.coupang.com', [{
    path: `${settlementRoot}/status/api`, body: createSettlementStatusRequest(settlementRequest),
    response: json({ data: { settlementStatusReports: rows } }),
  }], () => collectCoupangReports(settlementRequest)), /매출인식 기간|조회 기간과 일치하지|기간이 겹칩니다|정산 건이 없는 날짜 구간/);
});

test('advertising requests all campaigns, daily rows and product detail without excluding zero clicks', () => {
  const campaigns = createAdCampaignListRequest(adRequest);
  assert.equal(campaigns.operationName, 'GetCampaignListInBillboard');
  assert.deepEqual(campaigns.variables, { startDate: 20260901, endDate: 20260928, reportType: 'pa', rbacReportType: 'AD_REPORT' });
  const report = createAdPerformanceReportRequest(adRequest, ['one', 'two', 'one']);
  assert.deepEqual(report.variables, { reportType: 'pa', startDate: 20260901, endDate: 20260928, dateGroup: 'daily', granularity: 'vendorItem', excludeIfNoClickCount: false, campaignIds: ['one', 'two'] });
  assert.throws(() => createAdPerformanceReportRequest(adRequest, []), /광고 캠페인이 없습니다/);
});

test('mocked settlement transport sends validated group keys and preserves original filename and bytes', async () => {
  const fileName = 'A00000000-CATEGORY_TR-ko-00000000-0000-4000-8000-000000000000.xlsx';
  const url = `https://rfm-common-prod.s3.ap-northeast-2.amazonaws.com/settlements/seller-report-download-v2/${fileName}?signature=unit-test`;
  const downloads = await withOriginalRelay(url, original(fileName), () => withRequests('wing.coupang.com', settlementSteps(url), () => collectCoupangReports(settlementRequest)));
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].slot, 'CATEGORY_TR');
  assert.equal(downloads[0].fileName, fileName);
  assert.equal(downloads[0].mimeType, mime);
  assert.deepEqual(new Uint8Array(Buffer.from(downloads[0].base64, 'base64')), originalBytes);
});

test('a month with multiple settlement groups requests and preserves each separate Wing original', async () => {
  const rows = [settlementGroup('week-b', '2026-09-15'), settlementGroup('week-a', '2026-09-01', '2026-09-14')];
  const steps: FetchStep[] = [{ path: `${settlementRoot}/status/api`,
    body: createSettlementStatusRequest(settlementRequest), response: json({ data: { settlementStatusReports: rows } }) }];
  for (const [index, key] of ['week-a', 'week-b'].entries()) {
    const requestTime = String(requestedAt + index);
    const url = `https://wing.coupang.com/source-${index}.xlsx`;
    steps.push(
      { path: `${settlementRoot}/request-download/api`, body: { sellerReportType: 'CATEGORY_TR', requestTime,
        settlementGroupKeys: [key], locale: 'ko' }, response: json({ data: true }) },
      { path: `${settlementRoot}/download-list/api`, body: { requestTimeFrom: String(Number(requestTime) - 1000),
        requestTimeTo: requestTime }, response: json({ data: [{ requestTime, sellerReportType: 'CATEGORY_TR', downloadStatus: 'COMPLETED' }] }) },
      { path: `${settlementRoot}/download/api/v2`, body: { requestTime, locale: 'ko' }, response: json({ data: { url } }) },
      { path: url, response: original(`CATEGORY_TR_${key}.xlsx`) },
    );
  }
  const files = await withRequests('wing.coupang.com', steps, () => collectCoupangReports(settlementRequest));
  assert.deepEqual(files.map((file) => file.fileName), ['CATEGORY_TR_week-a.xlsx', 'CATEGORY_TR_week-b.xlsx']);
  assert.deepEqual(files.map((file) => file.sourcePeriod), [
    { start: '2026-09-01', end: '2026-09-14' }, { start: '2026-09-15', end: '2026-09-28' },
  ]);
  assert.ok(files.every((file) => file.slot === 'CATEGORY_TR'));
  assert.ok(files.every((file) => Buffer.from(file.base64, 'base64').equals(Buffer.from(originalBytes))));
});

test('an S3 original failure crosses the runtime bridge without retrying content fetch or exposing its query', async () => {
  const fileName = 'A00000000-CATEGORY_TR-ko-00000000-0000-4000-8000-000000000000.xlsx';
  const url = `https://rfm-common-prod.s3.ap-northeast-2.amazonaws.com/settlements/seller-report-download-v2/${fileName}?signature=unit-private`;
  await assert.rejects(withOriginalRelay(url, new Response('denied', { status: 403 }), () =>
    withRequests('wing.coupang.com', settlementSteps(url), () => collectCoupangReports(settlementRequest))),
  (error: Error) => /HTTP 403/.test(error.message) && !error.message.includes('unit-private') && !error.message.includes(url));
});

test('same-origin settlement file requests retain the Wing session', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const downloads = await withRequests('wing.coupang.com', settlementSteps(url, original('CATEGORY_TR_20260901_20260928.xlsx')), () => collectCoupangReports(settlementRequest));
  assert.equal(downloads.length, 1);
});

test('integrated advertising download selects the requested report and preserves original bytes', async () => {
  const fileName = 'seller_pa_daily_vendorItem_20260901_20260928.xlsx';
  const downloads = await withRequests('advertising.coupang.com', adSteps(original(fileName)), () => collectCoupangReports(adRequest));
  assert.equal(downloads[0].slot, 'adPerformance');
  assert.equal(downloads[0].fileName, fileName);
  assert.deepEqual(new Uint8Array(Buffer.from(downloads[0].base64, 'base64')), originalBytes);
});

test('report collection rejects a wrong host before making any request', async () => {
  await assert.rejects(withRequests('example.com', [], () => collectCoupangReports(settlementRequest)), /Wing 탭/);
  await assert.rejects(withRequests('wing.coupang.com', [], () => collectCoupangReports(adRequest)), /광고센터 탭/);
});

test('settlement collection rejects HTTP denial, authentication HTML and malformed status data', async () => {
  for (const [response, error] of [
    [json({}, 403), /HTTP 403/],
    [new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }), /로그인 또는 접근 제한/],
    [json({ data: {} }), /목록 응답 형식/],
    [json({ data: { settlementStatusReports: [] } }), /정산 건이 없습니다/],
  ] as const) {
    await assert.rejects(withRequests('wing.coupang.com', [{ path: `${settlementRoot}/status/api`, response }], () => collectCoupangReports(settlementRequest)), error);
  }
});

test('settlement collection rejects malformed status lists and failed report generation', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const malformed = settlementSteps(url).slice(0, 3);
  malformed[2].response = json({ data: {} });
  await assert.rejects(withRequests('wing.coupang.com', malformed, () => collectCoupangReports(settlementRequest)), /다운로드 목록 형식/);
  const failed = settlementSteps(url).slice(0, 3);
  failed[2].response = json({ data: [{ requestTime: String(requestedAt), sellerReportType: 'CATEGORY_TR', downloadStatus: 'FAILED' }] });
  await assert.rejects(withRequests('wing.coupang.com', failed, () => collectCoupangReports(settlementRequest)), /생성에 실패/);
});

test('settlement download rejects untrusted URL schemes, credentials and misleading hostnames', async () => {
  for (const url of ['http://wing.coupang.com/source.xlsx', 'https://coupang.com.evil.example/source.xlsx', 'https://user:password@wing.coupang.com/source.xlsx', 'https://example.com/source.xlsx']) {
    await assert.rejects(withRequests('wing.coupang.com', settlementSteps(url), () => collectCoupangReports(settlementRequest)), /허용되지 않은/);
  }
});

test('advertising collection rejects GraphQL errors and incomplete responses', async () => {
  await assert.rejects(withRequests('advertising.coupang.com', [{ path: graphqlPath, response: json({ errors: [{ message: 'Session expired' }] }) }], () => collectCoupangReports(adRequest)), /Session expired/);
  await assert.rejects(withRequests('advertising.coupang.com', [{ path: graphqlPath, response: json({}) }], () => collectCoupangReports(adRequest)), /보고서 데이터가 없습니다/);
});

test('original download rejects HTML, JSON, empty or non-Excel bytes and unsafe filenames', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const cases: [Response, RegExp][] = [
    [new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }), /인증\/오류 응답/],
    [json({ error: 'denied' }), /인증\/오류 응답/],
    [original('source.xlsx', new Uint8Array()), /비어 있거나/],
    [original('source.xlsx', new Uint8Array([1, 2, 3, 4])), /Excel 원본이 아닙니다/],
    [original('source.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04])), /Excel 원본이 아닙니다/],
    [original('source.xlsx', originalBytes.slice(0, -22)), /Excel 원본이 아닙니다/],
    [original('../source.xlsx'), /파일명을 확인할 수 없습니다/],
    [original('source.csv'), /파일명을 확인할 수 없습니다/],
    [new Response(originalBytes, { headers: { 'content-type': mime } }), /파일명을 확인할 수 없습니다/],
  ];
  for (const [response, error] of cases) {
    await assert.rejects(withRequests('wing.coupang.com', settlementSteps(url, response), () => collectCoupangReports(settlementRequest)), error);
  }
});

test('original ZIP accepts a valid archive comment and rejects an invalid EOCD comment length', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const commented = new Uint8Array(originalBytes.length + 3);
  commented.set(originalBytes);
  commented.set([0x61, 0x62, 0x63], originalBytes.length);
  commented[originalBytes.length - 2] = 3;
  const valid = await withRequests('wing.coupang.com', settlementSteps(url, original('source.xlsx', commented)), () => collectCoupangReports(settlementRequest));
  assert.deepEqual(new Uint8Array(Buffer.from(valid[0].base64, 'base64')), commented);
  commented[originalBytes.length - 2] = 4;
  await assert.rejects(withRequests('wing.coupang.com', settlementSteps(url, original('source.xlsx', commented)), () => collectCoupangReports(settlementRequest)), /Excel 원본이 아닙니다/);
});

test('original download rejects files exceeding the server upload limit', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const bytes = new Uint8Array(20 * 1024 * 1024 + 1);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  await assert.rejects(withRequests('wing.coupang.com', settlementSteps(url, original('source.xlsx', bytes)), () => collectCoupangReports(settlementRequest)), /20MiB/);
});


async function withFastDeadlines(run: (scheduled: number[]) => Promise<void>) {
  const nativeSetTimeout = globalThis.setTimeout;
  const scheduled: number[] = [];
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    scheduled.push(delay ?? 0);
    return nativeSetTimeout(callback, delay === 30_000 || delay === 60_000 ? 5 : delay === 2000 ? 0 : delay, ...args);
  }) as typeof setTimeout;
  try { await run(scheduled); }
  finally { globalThis.setTimeout = nativeSetTimeout; }
}

function stalledResponse(contentType: string, fileName?: string): Response {
  return new Response(new ReadableStream<Uint8Array>({ start() { /* server never finishes the body */ } }), {
    headers: { 'content-type': contentType, ...(fileName ? { 'content-disposition': `attachment; filename="${fileName}"` } : {}) },
  });
}

test('a stalled metadata body times out at thirty seconds, aborts and identifies the requested report', async () => {
  let signal: AbortSignal | undefined;
  await withFastDeadlines(async (scheduled) => {
    await assert.rejects(withRequests('wing.coupang.com', [{
      path: `${settlementRoot}/status/api`, response: stalledResponse('application/json'),
      onSignal: (value) => { signal = value; },
    }], () => collectCoupangReports(settlementRequest)), /CATEGORY_TR 정산 요청 시간이 30초를 초과/);
    assert.equal(signal?.aborted, true);
    assert.deepEqual(scheduled, [30_000]);
  });
});

test('a stalled advertising metadata body reports the advertising timeout without inventing a file', async () => {
  await withFastDeadlines(async (scheduled) => {
    await assert.rejects(withRequests('advertising.coupang.com', [{
      path: graphqlPath, response: stalledResponse('application/json'),
    }], () => collectCoupangReports(adRequest)), /광고 성과 요청 시간이 30초를 초과/);
    assert.deepEqual(scheduled, [30_000]);
  });
});

test('an unfinished original XLSX body times out at sixty seconds and aborts its download', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const steps = settlementSteps(url, stalledResponse(mime, 'CATEGORY_TR_20260901_20260928.xlsx'));
  let signal: AbortSignal | undefined;
  steps[steps.length - 1].onSignal = (value) => { signal = value; };
  await withFastDeadlines(async (scheduled) => {
    await assert.rejects(withRequests('wing.coupang.com', steps, () => collectCoupangReports(settlementRequest)),
      /CATEGORY_TR 정산 원본 다운로드 시간이 60초를 초과/);
    assert.equal(signal?.aborted, true);
    assert.deepEqual(scheduled, [30_000, 30_000, 30_000, 30_000, 60_000]);
  });
});

test('completed JSON and original downloads clear their deadlines without later aborting', async () => {
  const url = 'https://wing.coupang.com/source.xlsx';
  const signals: AbortSignal[] = [];
  const steps = settlementSteps(url, original('CATEGORY_TR_20260901_20260928.xlsx'));
  steps.forEach((step) => { step.onSignal = (signal) => { signals.push(signal); }; });
  await withFastDeadlines(async () => {
    const files = await withRequests('wing.coupang.com', steps, () => collectCoupangReports(settlementRequest));
    assert.equal(files.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(signals.length, 5);
    assert.ok(signals.every((signal) => !signal.aborted));
  });
});

test('pending settlement reports still stop after ninety polls', async () => {
  const steps = settlementSteps('https://wing.coupang.com/source.xlsx').slice(0, 2);
  for (let index = 0; index < 90; index += 1) steps.push({ path: `${settlementRoot}/download-list/api`,
    response: json({ data: [{ requestTime: String(requestedAt), sellerReportType: 'CATEGORY_TR', downloadStatus: 'PENDING' }] }) });
  await withFastDeadlines(async (scheduled) => {
    await assert.rejects(withRequests('wing.coupang.com', steps, () => collectCoupangReports(settlementRequest)), /정산 리포트 생성 대기 시간이 초과/);
    assert.equal(scheduled.filter((delay) => delay === 30_000).length, 92);
    assert.equal(scheduled.filter((delay) => delay === 2000).length, 90);
  });
});
