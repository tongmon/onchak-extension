/** Seller hints constrain ingestion; they do not authenticate workbook ownership. */
export function normalizeAbrsSellerId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return /^A\d{8}$/.test(normalized) ? normalized : undefined;
}

export function abrsSellerIdsFromFileName(fileName: string): string[] {
  return [...new Set([...fileName.matchAll(/(?<![A-Z0-9])A\d{8}(?![A-Z0-9])/gi)]
    .map((match) => match[0].toUpperCase()))];
}

export function resolveAbrsLedgerSellerId(
  entries: { sellerId?: string; fileName?: string; file?: File }[], expectedSellerId?: string,
): string | undefined {
  const sellers = new Set<string>();
  if (expectedSellerId !== undefined) {
    const normalized = normalizeAbrsSellerId(expectedSellerId);
    if (!normalized) throw new Error('쿠팡 판매자 ID를 확인할 수 없습니다. Wing에서 다시 로그인해 주세요.');
    sellers.add(normalized);
  }
  for (const entry of entries) {
    if (entry.sellerId !== undefined) {
      const normalized = normalizeAbrsSellerId(entry.sellerId);
      if (!normalized) throw new Error('저장 원본의 판매자 정보가 올바르지 않습니다. 원본을 다시 가져와 주세요.');
      sellers.add(normalized);
    }
    abrsSellerIdsFromFileName(entry.file?.name ?? entry.fileName ?? '').forEach((id) => sellers.add(id));
  }
  if (sellers.size > 1) throw new Error('쿠팡 판매자가 다른 원본이 섞여 있습니다. 한 Onchak 계정에서는 같은 판매자의 파일만 업로드해 주세요. 기존 파일은 보관되어 있습니다.');
  return [...sellers][0];
}

export function stampAbrsCoupangDownloads<T extends { fileName: string; sellerId?: string }>(
  originals: T[], expectedSellerId: string | undefined, before: string | undefined, after: string | undefined,
  wing: boolean,
): T[] {
  if (wing && (!before || before !== after)) {
    throw new Error('수집 중 쿠팡 판매자 세션이 변경되었거나 확인되지 않습니다. Wing을 새로고침한 뒤 다시 가져와 주세요.');
  }
  const sellerId = resolveAbrsLedgerSellerId(originals, expectedSellerId ?? before);
  if (expectedSellerId && wing && before !== expectedSellerId) {
    throw new Error('선택한 쿠팡 판매자와 현재 Wing 판매자가 다릅니다. 같은 판매자로 로그인해 주세요.');
  }
  if (!wing && expectedSellerId && originals.some((original) =>
    resolveAbrsLedgerSellerId([original]) !== expectedSellerId)) {
    throw new Error('광고센터 원본의 판매자가 Wing과 다르거나 확인되지 않습니다. 같은 판매자로 로그인해 주세요.');
  }
  return originals.map((original) => ({ ...original, ...(sellerId ? { sellerId } : {}) }));
}
