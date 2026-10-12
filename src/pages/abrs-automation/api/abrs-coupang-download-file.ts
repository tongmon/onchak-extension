import { resolveAbrsLedgerPeriod, type AbrsLedgerDateRange } from '../../../shared/extension/messaging/contracts.ts';

interface AbrsLedgerFilePayload {
  fileName: string;
  mimeType: string;
  base64: string;
  sourcePeriod?: AbrsLedgerDateRange;
  sellerId?: string;
}

const sourcePeriods = new WeakMap<File, AbrsLedgerDateRange>();
const sourceSellers = new WeakMap<File, string>();

export function getAbrsCoupangFileSellerId(file: File): string | undefined {
  return sourceSellers.get(file);
}

/** Metadata belongs to the source File, and must survive cache round trips. */
export function getAbrsCoupangFileSourcePeriod(file: File): AbrsLedgerDateRange | undefined {
  const period = sourcePeriods.get(file);
  return period ? { ...period } : undefined;
}

function validateSourcePeriod(fileName: string, sourcePeriod: AbrsLedgerDateRange): AbrsLedgerDateRange {
  if (!sourcePeriod || typeof sourcePeriod.start !== 'string' || typeof sourcePeriod.end !== 'string') {
    throw new Error('원본 파일의 조회 기간 정보가 올바르지 않습니다.');
  }
  let period: AbrsLedgerDateRange;
  try {
    period = resolveAbrsLedgerPeriod({ targetDate: sourcePeriod.end, periodStart: sourcePeriod.start, periodEnd: sourcePeriod.end });
  } catch {
    throw new Error('원본 파일의 조회 기간 정보가 올바르지 않습니다.');
  }
  const namedRange = fileName.match(/(20\d{6})[~_-](20\d{6})/);
  if (namedRange) {
    const compact = (day: string) => day.replaceAll('-', '');
    if (compact(period.start) !== namedRange[1] || compact(period.end) !== namedRange[2]) {
      throw new Error('원본 파일명과 조회 기간 정보가 서로 다릅니다.');
    }
  }
  return period;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

const xlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

/** Check the original ZIP envelope; the server validates the workbook contents. */
export function isAbrsLedgerXlsxPayload(download: AbrsLedgerFilePayload, expectedSize?: number): boolean {
  if (!/\.xlsx$/i.test(download.fileName)) return false;
  try {
    const bytes = base64ToBytes(download.base64);
    return (expectedSize === undefined || bytes.length === expectedSize) && hasZipEnvelope(bytes);
  } catch {
    return false;
  }
}

export function createAbrsLedgerCachedDownloadUrl(download: AbrsLedgerFilePayload): string {
  if (!isAbrsLedgerXlsxPayload(download)) {
    throw new Error('저장된 파일이 Excel 원본이 아닙니다. 쿠팡에서 다시 다운로드해주세요.');
  }
  // Wing sometimes labels OOXML as the legacy Excel MIME, which makes Chrome save .xls.
  return `data:${xlsxMimeType};base64,${download.base64}`;
}

export function createFileFromAbrsCoupangDownload(
  download: AbrsLedgerFilePayload,
): File {
  const bytes = base64ToBytes(download.base64);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const file = new File([buffer], download.fileName, {
    type: download.mimeType,
  });
  if (download.sourcePeriod !== undefined) {
    sourcePeriods.set(file, validateSourcePeriod(download.fileName, download.sourcePeriod));
  }
  if (download.sellerId !== undefined) {
    if (!/^A\d{8}$/.test(download.sellerId)) throw new Error('원본 파일의 판매자 정보가 올바르지 않습니다.');
    sourceSellers.set(file, download.sellerId);
  }
  return file;
}
