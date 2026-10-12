import type { AbrsCoupangLedgerDownload, AbrsCoupangOriginalDownloadRequest } from './messaging/contracts.ts';

const ORIGINAL_HOST = 'rfm-common-prod.s3.ap-northeast-2.amazonaws.com';
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
const ORIGINAL_TIMEOUT_MS = 60_000;
const ORIGINAL_PATH = /^\/settlements\/seller-report-download-v2\/(A\d+-(CATEGORY_TR|WAREHOUSING_SHIPPING|STORAGE_FEE|CRETURN_PICKUP_RESTOCKING|VRETURN_HANDLING|VRETURN_SHIPPING|INVENTORY_COMPENSATION|VALUE_ADDED_SERVICE_FEE|PPIR)-ko-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.xlsx)$/;

interface OriginalMessageSender {
  id?: string;
  url?: string;
  tab?: { id?: number; url?: string };
  frameId?: number;
}

function sourceUrl(request: AbrsCoupangOriginalDownloadRequest): URL {
  const invalid = () => new Error('허용되지 않은 쿠팡 정산 원본 다운로드 요청입니다.');
  if (!request || typeof request.url !== 'string' || !request.url.startsWith('https://')
    || request.url.includes('\\') || request.url.length > 65536) throw invalid();
  let url: URL;
  try { url = new URL(request.url); }
  catch { throw invalid(); }
  const path = ORIGINAL_PATH.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== ORIGINAL_HOST || url.port
    || url.username || url.password || url.hash || !path || path[2] !== request.slot) throw invalid();
  return url;
}

function senderUrl(value: string | undefined): URL | null {
  try { return value ? new URL(value) : null; }
  catch { return null; }
}

function isWingUrl(url: URL | null): boolean {
  return url?.origin === 'https://wing.coupang.com' && !url.username && !url.password;
}

function isOwnPage(url: URL | null, extensionId: string): boolean {
  return url?.protocol === 'chrome-extension:' && url.hostname === extensionId
    && !url.port && !url.username && !url.password;
}

/** This internal message is never exposed through webpage or external-extension events. */
export function validateAbrsCoupangOriginalRequest(
  request: AbrsCoupangOriginalDownloadRequest,
  sender: OriginalMessageSender,
  extensionId: string,
): void {
  const denied = () => new Error('쿠팡 정산 원본 다운로드 요청 발신자가 허용되지 않았습니다.');
  if (!extensionId || sender?.id !== extensionId) throw denied();
  const page = senderUrl(sender.url);
  const tab = senderUrl(sender.tab?.url);
  if (isOwnPage(page, extensionId)) {
    if (sender.frameId !== undefined && sender.frameId !== 0 || sender.tab && !isOwnPage(tab, extensionId)) throw denied();
  } else if (sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !isWingUrl(page) || !isWingUrl(tab)) {
    throw denied();
  }
  sourceUrl(request);
}

function originalFileName(response: Response, url: URL, slot: AbrsCoupangOriginalDownloadRequest['slot']): string {
  const disposition = response.headers.get('Content-Disposition');
  let fileName = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  if (disposition) {
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename=([^;]+)/i.exec(disposition);
    if (match) {
      try { fileName = decodeURIComponent(match[1].trim().replace(/^"|"$/g, '')); }
      catch { throw new Error('쿠팡 정산 원본의 파일명을 확인할 수 없습니다.'); }
    }
  }
  if (!/\.xlsx$/i.test(fileName) || /[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    throw new Error('쿠팡 정산 원본의 파일명을 확인할 수 없습니다.');
  }
  const reportKind = /(?:^|[-_])(CATEGORY_TR|WAREHOUSING_SHIPPING|STORAGE_FEE|CRETURN_PICKUP_RESTOCKING|VRETURN_HANDLING|VRETURN_SHIPPING|INVENTORY_COMPENSATION|VALUE_ADDED_SERVICE_FEE|BARCODE_LABELING_FEE|PPIR)(?=[-_.]|$)/.exec(fileName)?.[1];
  if ((reportKind === 'BARCODE_LABELING_FEE' ? 'VALUE_ADDED_SERVICE_FEE' : reportKind) !== slot) {
    throw new Error('쿠팡 정산 원본의 파일명이 요청한 파일과 다릅니다.');
  }
  return fileName;
}

function hasZipEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  for (let offset = bytes.length - 22; offset >= Math.max(4, bytes.length - 65557); offset--) {
    if (bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b || bytes[offset + 2] !== 0x05 || bytes[offset + 3] !== 0x06) continue;
    const commentLength = bytes[offset + 20] | bytes[offset + 21] << 8;
    if (offset + 22 + commentLength === bytes.length) return true;
  }
  return false;
}

/** Fetch only an already-issued original URL, without cookies, redirects or persisted URL metadata. */
export async function downloadAbrsCoupangOriginal(
  request: AbrsCoupangOriginalDownloadRequest,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<AbrsCoupangLedgerDownload> {
  const url = sourceUrl(request);
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bodyComplete = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('쿠팡 정산 원본 다운로드 제한 시간을 초과했습니다.');
      error.name = 'TimeoutError';
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      reject(error);
    }, options.timeoutMs ?? ORIGINAL_TIMEOUT_MS);
  });
  const operation = async (): Promise<AbrsCoupangLedgerDownload> => {
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(request.url, {
        method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
    } catch {
      throw new Error('쿠팡 정산 원본 다운로드 연결에 실패했습니다.');
    }
    reader = response.body?.getReader();
    if (!response.ok) throw new Error(`쿠팡 정산 원본 다운로드 실패(HTTP ${response.status})`);
    const mimeType = response.headers.get('Content-Type') ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (/text\/html|application\/json/i.test(mimeType)) throw new Error('쿠팡 정산 원본 대신 인증/오류 응답을 받았습니다.');
    const fileName = originalFileName(response, url, request.slot);
    const contentLength = response.headers.get('Content-Length');
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_ORIGINAL_BYTES)) {
      throw new Error('쿠팡 정산 원본이 개별 업로드 한도 20MiB를 초과하거나 크기 정보가 잘못되었습니다.');
    }
    if (!reader) throw new Error('쿠팡 정산 원본 파일이 비어 있습니다.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_ORIGINAL_BYTES) throw new Error('쿠팡 정산 원본이 개별 업로드 한도 20MiB를 초과합니다.');
        chunks.push(chunk.value);
      }
      bodyComplete = true;
    } catch {
      if (size > MAX_ORIGINAL_BYTES) throw new Error('쿠팡 정산 원본이 개별 업로드 한도 20MiB를 초과합니다.');
      throw new Error('쿠팡 정산 원본 파일을 끝까지 읽지 못했습니다.');
    }
    if (!size) throw new Error('쿠팡 정산 원본 파일이 비어 있습니다.');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (!hasZipEnvelope(bytes)) throw new Error('쿠팡 정산 원본이 유효한 Excel ZIP 파일이 아닙니다.');
    let binary = '';
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return { slot: request.slot, fileName, mimeType, base64: btoa(binary) };
  };
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (!bodyComplete) {
      controller.abort();
      void reader?.cancel().catch(() => undefined);
    }
  }
}
