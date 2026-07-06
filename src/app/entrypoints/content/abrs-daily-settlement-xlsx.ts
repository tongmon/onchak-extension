const DAILY_SETTLEMENT_HEADERS = [
  '날짜',
  '배송유형',
  '부가세 유형',
  '생성자',
  '담당자',
  '광고 유형',
  '광고 목표',
  '캠페인 ID',
  '캠페인명',
  '청구가능 금액 유형',
  '예산 유형',
  '광고 예산',
  '소진 광고비',
  '소진 광고비 중 조정 금액',
  '조정 후 소진 광고비',
  '초과 소진 금액',
  '청구 가능 광고비',
  '부가가치세',
  '청구금액(+부가가치세)',
] as const;

const DAILY_SETTLEMENT_COLUMN_COUNT = DAILY_SETTLEMENT_HEADERS.length;

type WorkbookCell = string | number | null | undefined;
type WorkbookRow = WorkbookCell[];

export interface DailySettlementSummaryData {
  domain?: string | null;
  deliveredAdcost?: number | null;
  deliveredAdcostAdj?: number | null;
  deliveredAdcostAfterAdj?: number | null;
  deliveredAdcostAfterCap?: number | null;
  billableAmount?: number | null;
  promotionAdjustment?: number | null;
  billableAdjustment?: number | null;
  vat?: number | null;
  totalFinalAmount?: number | null;
}

export interface DailySettlementSubtotalData
  extends DailySettlementSummaryData {
  date?: number | null;
  taxCode?: string | null;
}

export interface DailySettlementItem {
  date?: number | null;
  type?: string | null;
  settlementDomain?: string | null;
  campaignId?: number | string | null;
  campaignName?: string | null;
  adType?: string | null;
  goalType?: string | null;
  deliveredAdcost?: number | null;
  deliveredAdcostAdj?: number | null;
  deliveredAdcostAfterAdj?: number | null;
  budgetAmount?: number | null;
  budgetType?: string | null;
  deliveredAdcostAfterCap?: number | null;
  billableAmount?: number | null;
}

export interface DailySettlementPayload {
  summary?: {
    total?: DailySettlementSummaryData | null;
    nonRod?: DailySettlementSummaryData | null;
    rod?: DailySettlementSummaryData | null;
    rocketGrowth?: DailySettlementSummaryData | null;
  } | null;
  items?: DailySettlementItem[] | null;
  subtotals?: {
    nonRod?: DailySettlementSubtotalData[] | null;
    rod?: DailySettlementSubtotalData[] | null;
    rocketGrowth?: DailySettlementSubtotalData[] | null;
  } | null;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function asNumberOrZero(value: number | string | null | undefined): number {
  return asNumber(value) ?? 0;
}

function formatKoreanDate(compactDate: number | string | null | undefined): string | null {
  if (compactDate === null || typeof compactDate === 'undefined') {
    return null;
  }

  const value = String(compactDate);
  if (!/^\d{8}$/.test(value)) {
    return null;
  }

  return `${value.slice(0, 4)}년 ${value.slice(4, 6)}월 ${value.slice(6, 8)}일`;
}

function getGoalLabel(goalType: string | null | undefined): string | null {
  if (!goalType) {
    return null;
  }

  if (goalType === 'SALES') {
    return '매출 성장';
  }

  return goalType;
}

function getTaxCodeLabel(taxCode: string | null | undefined): string | null {
  if (!taxCode) {
    return null;
  }

  if (taxCode === 'B0') {
    return 'Taxable';
  }

  return taxCode;
}

function createRow(values: Record<number, WorkbookCell>): WorkbookRow {
  const row: WorkbookRow = Array.from(
    { length: DAILY_SETTLEMENT_COLUMN_COUNT },
    () => null,
  );

  Object.entries(values).forEach(([oneBasedColumn, value]) => {
    row[Number(oneBasedColumn) - 1] = value;
  });

  return row;
}

function getSubtotalRows(settlement: DailySettlementPayload): DailySettlementSubtotalData[] {
  return [
    ...(settlement.subtotals?.nonRod ?? []),
    ...(settlement.subtotals?.rod ?? []),
    ...(settlement.subtotals?.rocketGrowth ?? []),
  ];
}

function getPrimarySummary(
  settlement: DailySettlementPayload,
): DailySettlementSummaryData | null {
  return (
    settlement.summary?.rocketGrowth ??
    settlement.summary?.rod ??
    settlement.summary?.nonRod ??
    settlement.summary?.total ??
    null
  );
}

function getSummaryDomain(
  summary: DailySettlementSummaryData | null,
): string | null {
  return summary?.domain ?? (summary ? 'ROCKETGROWTH' : null);
}

function createDailySettlementRows(settlement: DailySettlementPayload): WorkbookRow[] {
  const rows: WorkbookRow[] = [[...DAILY_SETTLEMENT_HEADERS]];
  const summary = getPrimarySummary(settlement);

  if (summary) {
    rows.push(
      createRow({
        1: '전체',
        2: getSummaryDomain(summary),
        13: asNumberOrZero(summary.deliveredAdcost),
        14: asNumberOrZero(summary.deliveredAdcostAdj),
        15: asNumberOrZero(summary.deliveredAdcostAfterAdj),
        16: asNumberOrZero(summary.deliveredAdcostAfterCap),
        17: asNumberOrZero(summary.billableAmount),
        18: asNumberOrZero(summary.vat),
        19: asNumberOrZero(summary.totalFinalAmount),
      }),
    );
  }

  getSubtotalRows(settlement).forEach((subtotal) => {
    rows.push(
      createRow({
        1: formatKoreanDate(subtotal.date),
        2: subtotal.domain,
        3: getTaxCodeLabel(subtotal.taxCode),
        13: asNumberOrZero(subtotal.deliveredAdcost),
        14: asNumberOrZero(subtotal.deliveredAdcostAdj),
        15: asNumberOrZero(subtotal.deliveredAdcostAfterAdj),
        16: asNumberOrZero(subtotal.deliveredAdcostAfterCap),
        17: asNumberOrZero(subtotal.billableAmount),
        18: asNumberOrZero(subtotal.vat),
        19: asNumberOrZero(subtotal.totalFinalAmount),
      }),
    );
  });

  (settlement.items ?? []).forEach((item) => {
    rows.push(
      createRow({
        6: item.adType,
        7: getGoalLabel(item.goalType),
        8: asNumber(item.campaignId) ?? item.campaignId,
        9: item.campaignName,
        10: item.type,
        11: item.budgetType,
        12: asNumberOrZero(item.budgetAmount),
        13: asNumberOrZero(item.deliveredAdcost),
        14: asNumberOrZero(item.deliveredAdcostAdj),
        15: asNumberOrZero(item.deliveredAdcostAfterAdj),
        16: asNumberOrZero(item.deliveredAdcostAfterCap),
        17: asNumberOrZero(item.billableAmount),
      }),
    );
  });

  return rows;
}

function createSharedStrings(rows: WorkbookRow[]): {
  indexes: Map<string, number>;
  xml: string;
} {
  const strings: string[] = [];
  const indexes = new Map<string, number>();
  let count = 0;

  rows.forEach((row) => {
    row.forEach((cell) => {
      if (typeof cell !== 'string') {
        return;
      }

      count += 1;
      if (!indexes.has(cell)) {
        indexes.set(cell, strings.length);
        strings.push(cell);
      }
    });
  });

  const items = strings
    .map((value) => `<si><t>${xmlEscape(value)}</t></si>`)
    .join('');

  return {
    indexes,
    xml:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${count}" uniqueCount="${strings.length}">${items}</sst>`,
  };
}

function createSheetXml(rows: WorkbookRow[], sharedStringIndexes: Map<string, number>): string {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          if (cell === null || typeof cell === 'undefined' || cell === '') {
            return '';
          }

          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;

          if (typeof cell === 'number') {
            return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
          }

          return `<c r="${ref}" t="s"><v>${sharedStringIndexes.get(cell)}</v></c>`;
        })
        .join('');

      return `<row r="${rowIndex + 1}" spans="1:${DAILY_SETTLEMENT_COLUMN_COUNT}">${cells}</row>`;
    })
    .join('');

  const columnWidths = DAILY_SETTLEMENT_HEADERS.map((_, index) => {
    const width = index < 2 ? 20 : index === 8 ? 28 : 15;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr baseColWidth="10" defaultRowHeight="16"/>' +
    `<cols>${columnWidths}</cols>` +
    `<sheetData>${sheetRows}</sheetData>` +
    '<pageMargins bottom="0.75" footer="0.3" header="0.3" left="0.7" right="0.7" top="0.75"/>' +
    '</worksheet>'
  );
}

function createWorkbookXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    '<sheets><sheet name="dailySettlement" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>'
  );
}

function createWorkbookRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    '</Relationships>'
  );
}

function createRootRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>'
  );
}

function createContentTypesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>'
  );
}

function createStylesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf borderId="0" fillId="0" fontId="0" numFmtId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf borderId="0" fillId="0" fontId="0" numFmtId="0" xfId="0"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle builtinId="0" name="Normal" xfId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function createCoreXml(now = new Date()): string {
  const timestamp = now.toISOString();

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:creator>OnChak Extension</dc:creator>' +
    '<dc:title>dailySettlement</dc:title>' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  data.forEach((byte) => {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { dosDate: number; dosTime: number } {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);

  return { dosDate, dosTime };
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concatParts(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function createZipArchive(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const { dosDate, dosTime } = getDosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const checksum = crc32(file.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dosTime);
    writeUint16(localView, 12, dosDate);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, file.data.length);
    writeUint32(localView, 22, file.data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dosTime);
    writeUint16(centralView, 14, dosDate);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, file.data.length);
    writeUint32(centralView, 24, file.data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    localOffset += localHeader.length + file.data.length;
  });

  const localData = concatParts(localParts);
  const centralData = concatParts(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralData.length);
  writeUint32(endView, 16, localData.length);
  writeUint16(endView, 20, 0);

  return concatParts([localData, centralData, end]);
}

export function createDailySettlementWorkbookBytes(
  settlement: DailySettlementPayload,
): Uint8Array {
  const rows = createDailySettlementRows(settlement);
  const sharedStrings = createSharedStrings(rows);
  const encoder = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode(createContentTypesXml()) },
    { name: '_rels/.rels', data: encoder.encode(createRootRelsXml()) },
    { name: 'docProps/core.xml', data: encoder.encode(createCoreXml()) },
    { name: 'xl/workbook.xml', data: encoder.encode(createWorkbookXml()) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(createWorkbookRelsXml()),
    },
    { name: 'xl/styles.xml', data: encoder.encode(createStylesXml()) },
    { name: 'xl/sharedStrings.xml', data: encoder.encode(sharedStrings.xml) },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: encoder.encode(createSheetXml(rows, sharedStrings.indexes)),
    },
  ];

  return createZipArchive(files);
}
