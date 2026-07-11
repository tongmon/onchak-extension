import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createDailySettlementGraphqlRequest,
  createDailySettlementWorkbookFileName,
  createInventoryHealthExcelRequest,
  createSalesStatisticsAutoDownloadForm,
  detectAbrsCoupangSurface,
  extractFilenameFromContentDisposition,
  getDailySettlementFromGraphqlResponse,
} from '../src/app/entrypoints/content/abrs-coupang-page.ts';
import { createDailySettlementWorkbookBytes } from '../src/app/entrypoints/content/abrs-daily-settlement-xlsx.ts';

test('detectAbrsCoupangSurface identifies Coupang Wing inventory pages', () => {
  assert.equal(
    detectAbrsCoupangSurface(
      'https://wing.coupang.com/tenants/rfm/inventory/health',
    ),
    'wing-inventory',
  );
});

test('detectAbrsCoupangSurface identifies Coupang Wing sales pages', () => {
  assert.equal(
    detectAbrsCoupangSurface(
      'https://wing.coupang.com/tenants/rfm/inventory/sales/detail',
    ),
    'wing-sales',
  );
});

test('detectAbrsCoupangSurface identifies Coupang advertising pages', () => {
  assert.equal(
    detectAbrsCoupangSurface('https://advertising.coupang.com/reports'),
    'ads-center',
  );
  assert.equal(
    detectAbrsCoupangSurface('https://ads.coupang.com/analysis/02'),
    'ads-center',
  );
});

test('detectAbrsCoupangSurface returns unknown for unrelated pages', () => {
  assert.equal(detectAbrsCoupangSurface('https://example.com'), 'unknown');
});

test('createInventoryHealthExcelRequest matches Coupang Wing default inventory excel search', () => {
  assert.deepEqual(createInventoryHealthExcelRequest(), {
    paginationRequest: {
      pageSize: 10,
      pageNumber: 0,
      searchAfterSortValues: null,
    },
    hiddenStatus: 'VISIBLE',
  });
});

test('createSalesStatisticsAutoDownloadForm creates Coupang download manager payload', () => {
  const form = createSalesStatisticsAutoDownloadForm(
    '2026-04-18',
    'vendor-123',
  );

  assert.equal(form.get('type'), 'SELLER_INTEL_SELLER_METRICS');
  assert.equal(form.get('comment'), 'Sales Statistics');
  assert.equal(form.get('description'), 'Statistics-20260418~20260418');
  assert.deepEqual(JSON.parse(form.get('predicate') ?? '{}'), {
    vendorId: 'vendor-123',
    dateFrom: '2026-04-18',
    dateTo: '2026-04-18',
    vendorItemName: null,
    vendorItemIds: null,
    category: null,
    category2: null,
    pageSize: 10,
    actionedOn: false,
    rfmFlag: true,
  });
});

test('extractFilenameFromContentDisposition supports Coupang xlsx attachment names', () => {
  assert.equal(
    extractFilenameFromContentDisposition(
      'attachment;filename=inventory_health_sku_info_20260706223816.xlsx;',
    ),
    'inventory_health_sku_info_20260706223816.xlsx',
  );
  assert.equal(
    extractFilenameFromContentDisposition(
      "attachment; filename*=UTF-8''Statistics-20260418%7E20260418_(0).xlsx",
    ),
    'Statistics-20260418~20260418_(0).xlsx',
  );
  assert.equal(
    extractFilenameFromContentDisposition(
      'attachment; filename=Statistics-20260706%7E20260706_(0).xlsx',
    ),
    'Statistics-20260706~20260706_(0).xlsx',
  );
});

test('createDailySettlementGraphqlRequest matches Coupang ads daily settlement query variables', () => {
  const request = createDailySettlementGraphqlRequest('2026-04-18');

  assert.deepEqual(request.variables, {
    startDate: 20260418,
    endDate: 20260418,
    settlementDomain: 'SELLER',
  });
  assert.match(String(request.query), /getDailySettlement/);
});

test('daily settlement downloader gives a login guide instead of parsing HTML', async () => {
  const source = await readFile(
    new URL('../src/app/entrypoints/content/abrs-coupang-page.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /ADS_LOGIN_REQUIRED_MESSAGE/);
  assert.match(source, /content-type/);
  assert.match(source, /application\/json/);
  assert.match(source, /marketing\/dashboard/);
  assert.doesNotMatch(source, /Unexpected token/);
});

test('createDailySettlementWorkbookFileName uses Coupang daily settlement naming', () => {
  assert.equal(
    createDailySettlementWorkbookFileName('2026-04-18', 'A01549099'),
    'A01549099-dailySettlement-20260418-20260418.xlsx',
  );
});

test('getDailySettlementFromGraphqlResponse rejects empty daily settlement dates', () => {
  assert.throws(
    () =>
      getDailySettlementFromGraphqlResponse([
        {
          data: {
            getDailySettlement: {
              summary: { total: { deliveredAdcost: 0 } },
              items: [],
              subtotals: { nonRod: [], rod: [], rocketGrowth: [] },
            },
          },
        },
      ]),
    /광고비 정산 데이터가 없습니다/,
  );
});

test('createDailySettlementWorkbookBytes creates parseable xlsx zip content', () => {
  const bytes = createDailySettlementWorkbookBytes({
    summary: {
      rocketGrowth: {
        domain: 'ROCKETGROWTH',
        deliveredAdcost: 1209,
        deliveredAdcostAdj: 0,
        deliveredAdcostAfterAdj: 1209,
        deliveredAdcostAfterCap: 1209,
        billableAmount: 1209,
        vat: 121,
        totalFinalAmount: 1330,
      },
    },
    items: [
      {
        date: 20260418,
        type: 'Adcost',
        campaignId: 104778089,
        campaignName: 'AI스마트광고',
        adType: 'PA',
        goalType: 'SALES',
        budgetAmount: 10000,
        budgetType: 'DAILY_SOFT',
        deliveredAdcost: 1209,
        deliveredAdcostAdj: 0,
        deliveredAdcostAfterAdj: 1209,
        deliveredAdcostAfterCap: 1209,
        billableAmount: 1209,
      },
    ],
    subtotals: {
      rocketGrowth: [
        {
          date: 20260418,
          domain: 'ROCKETGROWTH',
          taxCode: 'B0',
          deliveredAdcost: 1209,
          deliveredAdcostAdj: 0,
          deliveredAdcostAfterAdj: 1209,
          deliveredAdcostAfterCap: 1209,
          billableAmount: 1209,
          vat: 121,
          totalFinalAmount: 1330,
        },
      ],
    },
  });
  const text = new TextDecoder().decode(bytes);

  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(text.includes('xl/worksheets/sheet1.xml'));
  assert.ok(text.includes('dailySettlement'));
  assert.ok(text.includes('AI스마트광고'));
  assert.ok(text.includes('청구금액(+부가가치세)'));
});
