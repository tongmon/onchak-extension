import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadAbrsCoupangOriginal,
  validateAbrsCoupangOriginalRequest,
} from '../src/shared/extension/coupang-original-download.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';

type OriginalRequest = Parameters<typeof downloadAbrsCoupangOriginal>[0];
type OriginalSender = Parameters<typeof validateAbrsCoupangOriginalRequest>[1];

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const wingUrl = 'https://wing.coupang.com/tenants/rfm/settlements/status-new';
const originalHost = 'https://rfm-common-prod.s3.ap-northeast-2.amazonaws.com';
const originalPrefix = '/settlements/seller-report-download-v2/';
const syntheticUuid = '00000000-0000-4000-8000-000000000000';
const originalBasename = `A00000000-CATEGORY_TR-ko-${syntheticUuid}.xlsx`;
const syntheticSecret = 'synthetic-secret-do-not-echo';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const maxBytes = 20 * 1024 * 1024;
// Only local generated fixture bytes are used. No production report or signed URL is embedded.
const originalBytes = createDailySettlementWorkbookBytes({});
const settlementSlots = [
  'CATEGORY_TR', 'WAREHOUSING_SHIPPING', 'STORAGE_FEE', 'CRETURN_PICKUP_RESTOCKING',
  'VRETURN_HANDLING', 'VRETURN_SHIPPING', 'INVENTORY_COMPENSATION', 'VALUE_ADDED_SERVICE_FEE', 'PPIR',
] as const;

function request(slot: typeof settlementSlots[number] = 'CATEGORY_TR'): OriginalRequest {
  return {
    slot,
    url: `${originalHost}${originalPrefix}A00000000-${slot}-ko-${syntheticUuid}.xlsx?unit=${syntheticSecret}`,
  };
}

function wingSender(): OriginalSender {
  return { id: extensionId, url: wingUrl, tab: { id: 1, url: wingUrl }, frameId: 0 };
}

function extensionSender(): OriginalSender {
  return { id: extensionId, url: `chrome-extension://${extensionId}/popup.html`, frameId: 0 };
}

function originalResponse(
  body: BodyInit | null = originalBytes,
  fileName = originalBasename,
  additionalHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(additionalHeaders);
  if (!headers.has('content-type')) headers.set('content-type', xlsxMime);
  if (!headers.has('content-disposition')) {
    headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  }
  return new Response(body, { headers });
}

function fetchResponse(response: Response, inspect?: (input: RequestInfo | URL, init?: RequestInit) => void): typeof fetch {
  return async (input, init) => { inspect?.(input, init); return response; };
}

async function rejectsWithoutUrl(operation: () => Promise<unknown>, extraSecrets: string[] = []): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof Error, 'Failures must use a controlled error');
    for (const value of [originalHost, syntheticSecret, request().url, ...extraSecrets]) {
      assert.equal(String(error).includes(value), false, 'Errors must not reveal the signed URL or response data');
    }
    return true;
  });
}

test('original request validation accepts the exact observed S3 path for each logical settlement slot', () => {
  for (const slot of settlementSlots) {
    assert.doesNotThrow(() => validateAbrsCoupangOriginalRequest(request(slot), wingSender(), extensionId));
  }
  assert.ok(request('VALUE_ADDED_SERVICE_FEE').url.includes('-VALUE_ADDED_SERVICE_FEE-ko-'));
});

test('only this extension may use a top-level Wing tab or its own extension page', () => {
  assert.doesNotThrow(() => validateAbrsCoupangOriginalRequest(request(), wingSender(), extensionId));
  assert.doesNotThrow(() => validateAbrsCoupangOriginalRequest(request(), extensionSender(), extensionId));
  for (const sender of [
    { ...wingSender(), id: undefined },
    { ...wingSender(), id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
  ]) assert.throws(() => validateAbrsCoupangOriginalRequest(request(), sender, extensionId));
});

test('remote hosts, iframes, missing tabs and conflicting sender surfaces cannot borrow extension authority', () => {
  const attackerUrl = 'https://attacker.example/';
  for (const sender of [
    { ...wingSender(), frameId: 1 },
    { ...wingSender(), url: attackerUrl },
    { ...wingSender(), url: 'http://wing.coupang.com/tenants/rfm/settlements/status-new' },
    { ...wingSender(), url: 'https://wing.coupang.com.attacker.example/' },
    { ...wingSender(), tab: { id: 1, url: attackerUrl } },
    { ...wingSender(), tab: undefined },
    { ...wingSender(), tab: { url: wingUrl } },
    { ...extensionSender(), frameId: 1 },
    { ...extensionSender(), tab: { id: 1, url: attackerUrl } },
    { ...extensionSender(), tab: { id: 1, url: wingUrl } },
    { ...extensionSender(), url: 'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/popup.html' },
  ]) assert.throws(() => validateAbrsCoupangOriginalRequest(request(), sender, extensionId));
});

test('original URL validation rejects different hosts, ports, credentials, paths and encoded path aliases', () => {
  const valid = request().url;
  const invalid = [
    valid.replace('https:', 'http:'),
    valid.replace('rfm-common-prod.s3.ap-northeast-2.amazonaws.com', 'rfm-common-prod.s3.ap-northeast-2.amazonaws.com.attacker.example'),
    valid.replace('rfm-common-prod.s3.ap-northeast-2.amazonaws.com', 'another-bucket.s3.ap-northeast-2.amazonaws.com'),
    valid.replace('rfm-common-prod.s3.ap-northeast-2.amazonaws.com', 'rfm-common-prod.s3.amazonaws.com'),
    valid.replace(originalHost, `${originalHost}:8443`),
    valid.replace('https://', 'https://user:password@'),
    valid.replace(originalPrefix, '/settlements/seller-report-download-v1/'),
    valid.replace(originalPrefix, `${originalPrefix}nested/`),
    valid.replace('A00000000-', 'not-a-seller-'),
    valid.replace('-ko-', '-en-'),
    valid.replace(syntheticUuid, 'not-a-uuid'),
    valid.replace('.xlsx?', '.csv?'),
    valid.replace('CATEGORY_TR', '%43ATEGORY_TR'),
    valid.replace('CATEGORY_TR', 'CATEGORY_TR%2Fextra'),
  ];
  for (const url of invalid) assert.throws(() => validateAbrsCoupangOriginalRequest({ ...request(), url }, wingSender(), extensionId), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(String(error).includes(syntheticSecret), false, 'Validation errors must not reveal URL query secrets');
    assert.equal(String(error).includes(url), false);
    return true;
  });
});

test('non-settlement slots and a path for a different logical report kind are rejected', () => {
  for (const slot of ['inventoryHealth', 'salesStatistics', 'productList', 'adPerformance', 'dailySettlement', 'BARCODE_LABELING_FEE', 'UNKNOWN']) {
    assert.throws(() => validateAbrsCoupangOriginalRequest({ ...request(), slot } as OriginalRequest, wingSender(), extensionId));
  }
  assert.throws(() => validateAbrsCoupangOriginalRequest({ ...request(), slot: 'PPIR' }, wingSender(), extensionId));
});

test('malformed message payloads cannot become an original download request', () => {
  for (const value of [null, undefined, [], {}, { slot: 'CATEGORY_TR' }, { url: request().url }, { ...request(), slot: {} }, { ...request(), url: {} }]) {
    assert.throws(() => validateAbrsCoupangOriginalRequest(value as OriginalRequest, wingSender(), extensionId));
  }
});

test('invalid original destinations are refused before invoking transport', async () => {
  let called = 0;
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal({ ...request(), url: 'https://attacker.example/original.xlsx' }, {
    fetch: async () => { called++; return originalResponse(); },
  }));
  assert.equal(called, 0, 'Invalid destinations must never be requested');
});

test('original transport uses a credential-free GET without redirects or referrer and preserves every original byte', async () => {
  const fileName = 'CATEGORY_TR_원본 정산 파일.xlsx';
  let called = 0;
  const download = await downloadAbrsCoupangOriginal(request(), {
    fetch: fetchResponse(originalResponse(originalBytes, fileName), (input, init) => {
      called++;
      assert.equal(String(input), request().url);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.referrerPolicy, 'no-referrer');
      assert.ok(init?.signal instanceof AbortSignal);
      const headers = new Headers(init?.headers);
      for (const header of ['authorization', 'cookie', 'x-xsrf-token']) assert.equal(headers.get(header), null);
    }),
  });
  assert.equal(called, 1);
  assert.equal(download.slot, 'CATEGORY_TR');
  assert.equal(download.fileName, fileName);
  assert.equal(download.mimeType, xlsxMime);
  assert.deepEqual(Buffer.from(download.base64, 'base64'), Buffer.from(originalBytes));
});

test('quoted ASCII Content-Disposition names are retained without inventing a replacement name', async () => {
  const response = originalResponse(originalBytes, 'ignored.xlsx', { 'content-disposition': 'attachment; filename="CATEGORY_TR_original.xlsx"' });
  const download = await downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(response) });
  assert.equal(download.fileName, 'CATEGORY_TR_original.xlsx');
});

test('original filename metadata cannot substitute another kind or contain paths, controls or a different extension', async () => {
  for (const fileName of ['PPIR_original.xlsx', '../original.xlsx', `${syntheticSecret}/original.xlsx`, 'folder/original.xlsx', 'folder\\original.xlsx', 'bad\u0000name.xlsx', 'bad\nname.xlsx', 'original.csv']) {
    await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(originalResponse(originalBytes, fileName)) }));
  }
  for (const disposition of ["attachment; filename*=UTF-8''%invalid.xlsx"]) {
    const response = originalResponse(originalBytes, 'ignored.xlsx', { 'content-disposition': disposition });
    await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(response) }));
  }
});

test('without a filename header the verified original URL basename is preserved', async () => {
  for (const disposition of ['', 'attachment']) {
    const response = originalResponse(originalBytes, 'ignored.xlsx', { 'content-disposition': disposition });
    const download = await downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(response) });
    assert.equal(download.fileName, originalBasename);
    assert.deepEqual(Buffer.from(download.base64, 'base64'), Buffer.from(originalBytes));
  }
});

test('HTTP denial, redirect and server failures expose no signed URL or response body', async () => {
  const responseSecret = 'synthetic-private-error-body';
  for (const status of [302, 401, 403, 404, 500]) {
    const response = new Response(`${responseSecret} ${request().url}`, { status });
    await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(response) }), [responseSecret]);
  }
});

test('transport exceptions that contain the original signed URL are replaced with generic errors', async () => {
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), {
    fetch: async () => { throw new Error(`Synthetic transport failure at ${request().url}`); },
  }));
});

test('a body stream failure cannot expose its original exception or the signed URL', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new Error(`Synthetic body failure at ${request().url}`)); },
  });
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(originalResponse(body)) }));
});

test('empty responses, authentication HTML, non-ZIP content and incomplete ZIP envelopes are refused', async () => {
  const truncated = originalBytes.slice(0, originalBytes.length - 1);
  const trailing = new Uint8Array(originalBytes.length + 1);
  trailing.set(originalBytes);
  for (const body of [new Uint8Array(), new TextEncoder().encode('<html>Access Denied</html>'), new TextEncoder().encode('{"error":"synthetic"}'), truncated, trailing]) {
    await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(originalResponse(body)) }));
  }
  const notZip = originalBytes.slice();
  notZip[0] = 0;
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(originalResponse(notZip)) }));
});

test('authentication MIME types are refused even if the body has an Excel ZIP envelope', async () => {
  for (const contentType of ['text/html; charset=utf-8', 'application/json']) {
    await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), {
      fetch: fetchResponse(originalResponse(originalBytes, originalBasename, { 'content-type': contentType })),
    }));
  }
});

test('an oversized declared Content-Length is refused before reading any response bytes', async () => {
  const response = originalResponse(originalBytes, originalBasename, { 'content-length': String(maxBytes + 1) });
  assert.ok(response.body);
  let readCalls = 0;
  const getReader = response.body.getReader.bind(response.body);
  Object.defineProperty(response.body, 'getReader', { value: () => {
    const reader = getReader();
    const read = reader.read.bind(reader);
    Object.defineProperty(reader, 'read', { value: () => { readCalls++; return read(); } });
    return reader;
  } });
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(response) }));
  assert.equal(readCalls, 0, 'Oversized declared bodies must not be accumulated');
});

test('streaming size enforcement cancels an oversized body even when Content-Length understates its size', async () => {
  let cancelled = false;
  let pulled = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulled++; if (pulled <= 22) controller.enqueue(chunk); else controller.close(); },
    cancel() { cancelled = true; },
  });
  const response = originalResponse(body, originalBasename, { 'content-length': '1' });
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(response) }));
  assert.equal(cancelled, true, 'The producer must be stopped after the cap is exceeded');
  assert.ok(pulled <= 22, 'The downloader must stop at the 20 MiB boundary');
});

test('a chunked original without Content-Length retains the original filename and byte order', async () => {
  const chunks = [originalBytes.slice(0, 4), originalBytes.slice(4, 37), originalBytes.slice(37)];
  const body = new ReadableStream<Uint8Array>({
    start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); controller.close(); },
  });
  const download = await downloadAbrsCoupangOriginal(request(), { fetch: fetchResponse(originalResponse(body)) });
  assert.deepEqual(Buffer.from(download.base64, 'base64'), Buffer.from(originalBytes));
});

test('the request deadline aborts stalled response headers without leaking the signed URL', async () => {
  let signal: AbortSignal | undefined;
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), {
    timeoutMs: 10,
    fetch: async (_input, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}); },
  }));
  assert.equal(signal?.aborted, true);
});

test('the request deadline includes a stalled body and cancels its reader', async () => {
  let signal: AbortSignal | undefined;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), {
    timeoutMs: 10,
    fetch: fetchResponse(originalResponse(body), (_input, init) => { signal = init?.signal as AbortSignal; }),
  }));
  assert.equal(signal?.aborted, true);
  assert.equal(cancelled, true, 'A timed-out body must not keep producing in the background');
});

test('a successful original download clears its deadline instead of aborting its completed request later', async () => {
  let signal: AbortSignal | undefined;
  await downloadAbrsCoupangOriginal(request(), {
    timeoutMs: 10,
    fetch: fetchResponse(originalResponse(), (_input, init) => { signal = init?.signal as AbortSignal; }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(signal?.aborted, false);
});

test('the default original request deadline is sixty seconds and aborts stalled transport', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  let signal: AbortSignal | undefined;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    delays.push(delay ?? 0);
    return originalSetTimeout(callback, Math.min(delay ?? 0, 5), ...args);
  }) as typeof globalThis.setTimeout;
  try {
    await rejectsWithoutUrl(() => downloadAbrsCoupangOriginal(request(), {
      fetch: async (_input, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}); },
    }));
    assert.ok(delays.includes(60_000));
    assert.equal(signal?.aborted, true);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
