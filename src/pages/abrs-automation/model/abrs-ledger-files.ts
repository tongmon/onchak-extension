export type AbrsLedgerFileSlot =
  | 'inventoryHealth'
  | 'salesStatistics'
  | 'dailySettlement'
  | 'productList';

export type AbrsLedgerSourceType =
  | 'COUPANG_INVENTORY_HEALTH'
  | 'COUPANG_SALES_STATISTICS'
  | 'COUPANG_DAILY_SETTLEMENT'
  | 'COUPANG_PRICE_INVENTORY';

export interface AbrsLedgerDateRange {
  start: string;
  end: string;
}

export interface AbrsLedgerFileClassification {
  slot: AbrsLedgerFileSlot;
  sourceType: AbrsLedgerSourceType;
  label: string;
  dateRange: AbrsLedgerDateRange | null;
}

export interface AbrsLedgerFileEntry extends AbrsLedgerFileClassification {
  file: File;
}

export interface AbrsLedgerValidationResult {
  ok: boolean;
  messages: string[];
}

const SLOT_DEFINITIONS: Record<
  AbrsLedgerFileSlot,
  Pick<AbrsLedgerFileClassification, 'sourceType' | 'label'>
> = {
  inventoryHealth: {
    sourceType: 'COUPANG_INVENTORY_HEALTH',
    label: '재고 현황',
  },
  salesStatistics: {
    sourceType: 'COUPANG_SALES_STATISTICS',
    label: '판매 현황',
  },
  dailySettlement: {
    sourceType: 'COUPANG_DAILY_SETTLEMENT',
    label: '광고비/정산',
  },
  productList: {
    sourceType: 'COUPANG_PRICE_INVENTORY',
    label: '상품 리스트',
  },
};

const REQUIRED_SLOTS: AbrsLedgerFileSlot[] = [
  'inventoryHealth',
  'salesStatistics',
  'dailySettlement',
];

function formatCompactDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const formatted = `${year}-${month}-${day}`;
  const parsedDate = new Date(`${formatted}T00:00:00.000Z`);

  if (
    parsedDate.getUTCFullYear() !== Number(year) ||
    parsedDate.getUTCMonth() + 1 !== Number(month) ||
    parsedDate.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return formatted;
}

function createDateRange(
  startCompactDate: string,
  endCompactDate: string,
): AbrsLedgerDateRange | null {
  const start = formatCompactDate(startCompactDate);
  const end = formatCompactDate(endCompactDate);

  return start && end ? { start, end } : null;
}

function createClassification(
  slot: AbrsLedgerFileSlot,
  dateRange: AbrsLedgerDateRange | null,
): AbrsLedgerFileClassification {
  return {
    slot,
    sourceType: SLOT_DEFINITIONS[slot].sourceType,
    label: SLOT_DEFINITIONS[slot].label,
    dateRange,
  };
}

export function classifyAbrsLedgerFile(
  fileName: string,
): AbrsLedgerFileClassification | null {
  const normalizedName = fileName.trim();

  if (/^inventory_health_sku_info_\d{14}\.xlsx$/i.test(normalizedName)) {
    return createClassification('inventoryHealth', null);
  }

  if (/^price_inventory_.+\.xlsx$/i.test(normalizedName)) {
    return createClassification('productList', null);
  }

  const statisticsMatch = normalizedName.match(
    /^statistics-(\d{8})~(\d{8})(?:_\(\d+\))?\.xlsx$/i,
  );

  if (statisticsMatch) {
    const dateRange = createDateRange(statisticsMatch[1], statisticsMatch[2]);

    return dateRange ? createClassification('salesStatistics', dateRange) : null;
  }

  const settlementMatch = normalizedName.match(
    /^.+-dailysettlement-(\d{8})-(\d{8})\.xlsx$/i,
  );

  if (settlementMatch) {
    const dateRange = createDateRange(settlementMatch[1], settlementMatch[2]);

    return dateRange ? createClassification('dailySettlement', dateRange) : null;
  }

  return null;
}

export function upsertAbrsLedgerFiles(
  existingEntries: AbrsLedgerFileEntry[],
  incomingFiles: File[],
  targetDate: string,
): AbrsLedgerFileEntry[] {
  void targetDate;

  return incomingFiles.reduce<AbrsLedgerFileEntry[]>(
    (entries, file) => {
      const classification = classifyAbrsLedgerFile(file.name);

      if (!classification) {
        return entries;
      }

      const nextEntry: AbrsLedgerFileEntry = {
        ...classification,
        file,
      };
      const existingIndex = entries.findIndex(
        (entry) => entry.slot === classification.slot,
      );

      if (existingIndex >= 0) {
        const nextEntries = [...entries];
        nextEntries[existingIndex] = nextEntry;
        return nextEntries;
      }

      return [...entries, nextEntry];
    },
    [...existingEntries],
  );
}

export function validateAbrsLedgerFiles(
  entries: AbrsLedgerFileEntry[],
  targetDate: string,
): AbrsLedgerValidationResult {
  const messages: string[] = [];

  for (const slot of REQUIRED_SLOTS) {
    const entry = entries.find((candidate) => candidate.slot === slot);

    if (!entry) {
      messages.push(`${SLOT_DEFINITIONS[slot].label} 파일을 추가해주세요.`);
    }
  }

  for (const entry of entries) {
    const { dateRange } = entry;

    if (!dateRange) {
      continue;
    }

    if (dateRange.start !== targetDate || dateRange.end !== targetDate) {
      messages.push(
        `${entry.label} 파일 날짜(${dateRange.start}~${dateRange.end})가 선택 날짜(${targetDate})와 다릅니다.`,
      );
    }
  }

  return {
    ok: messages.length === 0,
    messages,
  };
}

export function createAbrsLedgerBatchName(targetDate: string): string {
  return `abrs-${targetDate}`;
}
