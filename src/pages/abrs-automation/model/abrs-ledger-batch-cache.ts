import type {
  AbrsCoupangLedgerDownload,
  AbrsLedgerPersistedEntry,
} from '../../../shared/extension/messaging/contracts.ts';
import { createFileFromAbrsCoupangDownload } from '../api/abrs-coupang-download-file.ts';
import {
  classifyAbrsLedgerFile,
  type AbrsLedgerFileEntry,
} from './abrs-ledger-files.ts';

const defaultXlsxMimeType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface PersistAbrsLedgerFilesInput {
  existingEntries: AbrsLedgerPersistedEntry[];
  files: File[];
  targetDate: string;
  savedAt?: string;
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
    (entry) => entry.slot === nextEntry.slot,
  );

  if (existingIndex >= 0) {
    const nextEntries = [...entries];
    nextEntries[existingIndex] = nextEntry;
    return nextEntries;
  }

  return [...entries, nextEntry];
}

export async function persistAbrsLedgerFiles({
  existingEntries,
  files,
  targetDate,
  savedAt = new Date().toISOString(),
}: PersistAbrsLedgerFilesInput): Promise<AbrsLedgerPersistedEntry[]> {
  void targetDate;

  let entries = [...existingEntries];

  for (const file of files) {
    const classification = classifyAbrsLedgerFile(file.name);

    if (!classification) {
      continue;
    }

    entries = upsertPersistedEntry(entries, {
      ...classification,
      fileName: file.name,
      mimeType: file.type || defaultXlsxMimeType,
      base64: await fileToBase64(file),
      size: file.size,
      savedAt,
    });
  }

  return entries;
}

export function upsertAbrsLedgerPersistedDownloads({
  existingEntries,
  downloads,
  savedAt = new Date().toISOString(),
}: UpsertAbrsLedgerPersistedDownloadsInput): AbrsLedgerPersistedEntry[] {
  return downloads.reduce<AbrsLedgerPersistedEntry[]>((entries, download) => {
    const classification = classifyAbrsLedgerFile(download.fileName);

    if (!classification) {
      return entries;
    }

    const nextEntry: AbrsLedgerPersistedEntry = {
      ...classification,
      fileName: download.fileName,
      mimeType: download.mimeType || defaultXlsxMimeType,
      base64: download.base64,
      size: createFileFromAbrsCoupangDownload(download).size,
      savedAt,
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
    file: createFileFromAbrsCoupangDownload({
      slot: entry.slot,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      base64: entry.base64,
    }),
  }));
}
