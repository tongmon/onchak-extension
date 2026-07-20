interface AbrsLedgerFilePayload {
  fileName: string;
  mimeType: string;
  base64: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function createFileFromAbrsCoupangDownload(
  download: AbrsLedgerFilePayload,
): File {
  const bytes = base64ToBytes(download.base64);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return new File([buffer], download.fileName, {
    type: download.mimeType,
  });
}
