import type {
  AbrsCoupangLedgerDownload,
  AbrsLedgerPersistedEntry,
  AbrsLedgerOriginalSignature,
} from '../../../shared/extension/messaging/contracts.ts';
import { createFileFromAbrsCoupangDownload, getAbrsCoupangFileSourcePeriod, getAbrsCoupangFileSellerId } from '../api/abrs-coupang-download-file.ts';
import { resolveAbrsLedgerSellerId, normalizeAbrsSellerId } from './abrs-ledger-seller.ts';
import {
  classifyAbrsLedgerFile,
  abrsLedgerEntryIdentity,
  type AbrsLedgerFileEntry,
} from './abrs-ledger-files.ts';

const defaultXlsxMimeType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function canonicalOriginalFileName(fileName: string): string {
  // Chrome copy suffixes are unrelated to Statistics' actual _(0), _(1) shards.
  return fileName.replace(/\s+\(\d+\)(?=\.xlsx$)/i, '');
}

async function contentSha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createAbrsLedgerOriginalSignatures(
  entries: AbrsLedgerFileEntry[],
): Promise<AbrsLedgerOriginalSignature[]> {
  return Promise.all(entries.map(async (entry) => ({
    slot: entry.slot,
    canonicalFileName: canonicalOriginalFileName(entry.file.name),
    contentSha256: await contentSha256(await entry.file.arrayBuffer()),
    dateRange: entry.dateRange ? { ...entry.dateRange } : null,
    ...(entry.sellerId ? { sellerId: entry.sellerId } : {}),
  })));
}

function originalSignatureKey(signature: AbrsLedgerOriginalSignature): string {
  return JSON.stringify([signature.slot, signature.canonicalFileName, signature.contentSha256,
    signature.dateRange?.start ?? null, signature.dateRange?.end ?? null, signature.sellerId ?? null]);
}

function validateOriginalSignatures(signatures: AbrsLedgerOriginalSignature[]): void {
  if (!Array.isArray(signatures) || signatures.some((signature) => {
    if (!signature || typeof signature.canonicalFileName !== 'string'
      || classifyAbrsLedgerFile(signature.canonicalFileName)?.slot !== signature.slot
      || typeof signature.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(signature.contentSha256)) return true;
    if (signature.sellerId !== undefined && normalizeAbrsSellerId(signature.sellerId) !== signature.sellerId) return true;
    const range = signature.dateRange;
    return range !== null && (!range || typeof range.start !== 'string' || typeof range.end !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end) || range.start > range.end);
  })) throw new Error('접수한 원본의 삭제 확인 정보가 올바르지 않습니다. 저장 파일은 보관되어 있습니다.');
}

/** A late receipt may acknowledge old bytes, but must never remove another window's new originals. */
export async function retainUnacknowledgedAbrsLedgerEntries(
  entries: AbrsLedgerPersistedEntry[], expectedOriginals: AbrsLedgerOriginalSignature[],
): Promise<AbrsLedgerPersistedEntry[]> {
  validateOriginalSignatures(expectedOriginals);
  const acknowledged = new Set(expectedOriginals.map(originalSignatureKey));
  const retained: AbrsLedgerPersistedEntry[] = [];
  for (const entry of entries) {
    try {
      const binary = atob(entry.base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const signature: AbrsLedgerOriginalSignature = {
        slot: entry.slot, canonicalFileName: canonicalOriginalFileName(entry.fileName),
        contentSha256: await contentSha256(bytes.buffer), dateRange: entry.dateRange,
        ...(entry.sellerId ? { sellerId: entry.sellerId } : {}),
      };
      if (!acknowledged.has(originalSignatureKey(signature))) retained.push(entry);
    } catch {
      // Undecodable originals are not proof of a matching upload.
      retained.push(entry);
    }
  }
  return retained;
}

export interface PersistAbrsLedgerFilesInput {
  existingEntries: AbrsLedgerPersistedEntry[];
  files: File[];
  targetDate: string;
  savedAt?: string;
  replaceSlots?: AbrsLedgerPersistedEntry['slot'][];
}

export interface UpsertAbrsLedgerPersistedDownloadsInput {
  existingEntries: AbrsLedgerPersistedEntry[];
  downloads: AbrsCoupangLedgerDownload[];
  savedAt?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fileToBase64(file: File): Promise<string> {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

function upsertPersistedEntry(
  entries: AbrsLedgerPersistedEntry[],
  nextEntry: AbrsLedgerPersistedEntry,
): AbrsLedgerPersistedEntry[] {
  const existingIndex = entries.findIndex(
    (entry) => abrsLedgerEntryIdentity(entry.slot, entry.fileName) === abrsLedgerEntryIdentity(nextEntry.slot, nextEntry.fileName),
  );

  if (existingIndex >= 0) {
    const nextEntries = [...entries];
    nextEntries[existingIndex] = nextEntry;
    return nextEntries;
  }

  return [...entries, nextEntry];
}

export function upsertAbrsLedgerPersistedEntries(
  existingEntries: AbrsLedgerPersistedEntry[], incomingEntries: AbrsLedgerPersistedEntry[],
): AbrsLedgerPersistedEntry[] {
  resolveAbrsLedgerSellerId([...existingEntries, ...incomingEntries]);
  return incomingEntries.reduce(upsertPersistedEntry, [...existingEntries]);
}

export async function persistAbrsLedgerFiles({
  existingEntries,
  files,
  targetDate,
  savedAt = new Date().toISOString(),
  replaceSlots = [],
}: PersistAbrsLedgerFilesInput): Promise<AbrsLedgerPersistedEntry[]> {
  void targetDate;
  resolveAbrsLedgerSellerId([...existingEntries, ...files.map((file) => ({ file, sellerId: getAbrsCoupangFileSellerId(file) }))]);

  const replacementSlots = new Set(replaceSlots);
  for (const slot of replacementSlots) {
    if (!files.some((file) => classifyAbrsLedgerFile(file.name)?.slot === slot)) {
      throw new Error('새 원본이 없는 종류의 저장 파일은 교체할 수 없습니다.');
    }
  }
  // Explicit re-collection replaces that kind only after all new bytes are ready.
  // Manual additions retain multiple statement originals by default.
  let entries = existingEntries.filter((entry) => !replacementSlots.has(entry.slot));

  for (const file of files) {
    const classification = classifyAbrsLedgerFile(file.name);

    if (!classification) {
      continue;
    }

    entries = upsertPersistedEntry(entries, {
      ...classification,
      dateRange: getAbrsCoupangFileSourcePeriod(file) ?? classification.dateRange,
      fileName: file.name,
      mimeType: file.type || defaultXlsxMimeType,
      base64: await fileToBase64(file),
      size: file.size,
      savedAt,
      ...(getAbrsCoupangFileSellerId(file) ? { sellerId: getAbrsCoupangFileSellerId(file) } : {}),
      ...(replacementSlots.has(classification.slot) ? { collectionVersion: 2 } : {}),
    });
  }

  return entries;
}

export function upsertAbrsLedgerPersistedDownloads({
  existingEntries,
  downloads,
  savedAt = new Date().toISOString(),
}: UpsertAbrsLedgerPersistedDownloadsInput): AbrsLedgerPersistedEntry[] {
  resolveAbrsLedgerSellerId([...existingEntries, ...downloads]);
  return downloads.reduce<AbrsLedgerPersistedEntry[]>((entries, download) => {
    const classification = classifyAbrsLedgerFile(download.fileName);

    if (!classification) {
      return entries;
    }

    const file = createFileFromAbrsCoupangDownload(download);
    const nextEntry: AbrsLedgerPersistedEntry = {
      ...classification,
      dateRange: getAbrsCoupangFileSourcePeriod(file) ?? classification.dateRange,
      fileName: download.fileName,
      mimeType: download.mimeType || defaultXlsxMimeType,
      base64: download.base64,
      size: file.size,
      savedAt,
      collectionVersion: 2,
      ...(download.sellerId ? { sellerId: download.sellerId } : {}),
    };

    return upsertPersistedEntry(entries, nextEntry);
  }, [...existingEntries]);
}

export function restoreAbrsLedgerEntries(
  entries: AbrsLedgerPersistedEntry[],
): AbrsLedgerFileEntry[] {
  return entries.map((entry) => ({
    slot: entry.slot,
    sourceType: entry.sourceType,
    label: entry.label,
    dateRange: entry.dateRange,
    ...(entry.sellerId ? { sellerId: entry.sellerId } : {}),
    file: createFileFromAbrsCoupangDownload({
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      base64: entry.base64,
      ...(entry.dateRange ? { sourcePeriod: entry.dateRange } : {}),
      ...(entry.sellerId ? { sellerId: entry.sellerId } : {}),
    }),
  }));
}
