import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createDailySettlementGraphqlRequest,
  createDailySettlementWorkbookFileName,
  createInventoryHealthExcelRequest,
  createProductListDownloadRequest,
  createSalesStatisticsAutoDownloadForm,
  detectAbrsCoupangSurface,
  downloadAbrsCoupangLedgerFile,
  extractFilenameFromContentDisposition,
  getDailySettlementFromGraphqlResponse,
} from '../src/app/entrypoints/content/abrs-coupang-page.ts';
import {
  normalizeAbrsCoupangDownloads,
  resolveAbrsLedgerPeriod,
} from '../src/shared/extension/messaging/contracts.ts';
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

test('Statistics request preserves a multi-day reporting period', () => {
  const form = createSalesStatisticsAutoDownloadForm('2026-09-01', 'vendor-123', '2026-09-28');
  const predicate = JSON.parse(form.get('predicate') ?? '{}');
  assert.equal(predicate.dateFrom, '2026-09-01');
  assert.equal(predicate.dateTo, '2026-09-28');
  assert.equal(form.get('description'), 'Statistics-20260901~20260928');
});

test('ledger period rejects reversed and invalid calendar dates', () => {
  assert.deepEqual(resolveAbrsLedgerPeriod({ targetDate: '2026-09-28', periodStart: '2026-09-01', periodEnd: '2026-09-28' }), { start: '2026-09-01', end: '2026-09-28' });
  assert.deepEqual(resolveAbrsLedgerPeriod({ targetDate: '2026-09-28' }), { start: '2026-09-28', end: '2026-09-28' });
  assert.throws(() => resolveAbrsLedgerPeriod({ targetDate: '2026-02-30' }), /날짜 형식/);
  assert.throws(() => resolveAbrsLedgerPeriod({ targetDate: '2026-09-28', periodStart: '2026-09-29' }), /시작일/);
});

test('a monthly settlement response retains every source file for the same slot', () => {
  const first = { slot: 'CATEGORY_TR' as const, fileName: 'first.xlsx', mimeType: 'application/octet-stream', base64: 'UEs=' };
  const second = { ...first, fileName: 'second.xlsx' };
  assert.deepEqual(normalizeAbrsCoupangDownloads(first), [first]);
  assert.deepEqual(normalizeAbrsCoupangDownloads([first, second]), [first, second]);
});

test('inventory downloader rejects an authentication HTML response instead of returning it as Excel', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'wing.coupang.com' } } });
  globalThis.fetch = async () => new Response('<html>Login required</html>', { headers: { 'content-type': 'text/html' } });
  try {
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'inventoryHealth', targetDate: '2026-09-28' }), /Excel 파일 대신/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('createProductListDownloadRequest matches Coupang Wing price inventory request', () => {
  const request = createProductListDownloadRequest(
    new Date('2026-07-21T12:00:00+09:00'),
  );

  assert.equal(request.requestType, 'VENDOR_INVENTORY_ITEM');
  assert.equal(request.fileDescription, 'price_inventory_260721');
  assert.equal(request.comment, '가격_재고_판매상태 변경(260721)');
  assert.deepEqual(request.selectedTypes, []);
  assert.deepEqual(request.productSearchV2Condition.productStatus, ['ALL']);
  assert.equal(request.productSearchV2Condition.locale, 'ko_KR');
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


async function withCoreEnvironment(
  run: (control: { advance: (ms: number) => void; delays: number[] }) => Promise<void>,
  fastTimeouts = false,
) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const nativeSetTimeout = globalThis.setTimeout;
  let clock = 1_791_698_400_000;
  const delays: number[] = [];
  Date.now = () => clock;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { hostname: 'wing.coupang.com', origin: 'https://wing.coupang.com' },
    __GLOBAL_DATA__: { vendorId: 'A01549099' },
    setTimeout(callback: () => void, ms: number) { delays.push(ms); clock += ms; callback(); return 1; },
  } });
  if (fastTimeouts) {
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) =>
      nativeSetTimeout(callback, ms === 30_000 || ms === 60_000 ? 5 : ms, ...args)) as typeof setTimeout;
  }
  try { await run({ advance(ms) { clock += ms; }, delays }); }
  finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    globalThis.setTimeout = nativeSetTimeout;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function coreJson(body: unknown) { return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }); }
function coreStalledBody(contentType: string): Response {
  return new Response(new ReadableStream<Uint8Array>({ start() {} }), { headers: { 'content-type': contentType } });
}
function coreOriginal(): Response {
  return new Response(createDailySettlementWorkbookBytes({}), {
    headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });
}

test('inventory original body cannot stall beyond its sixty-second deadline', async () => {
  let signal: AbortSignal | undefined;
  await withCoreEnvironment(async () => {
    globalThis.fetch = async (_input, init) => {
      signal = init?.signal as AbortSignal;
      return coreStalledBody('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    };
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'inventoryHealth', targetDate: '2026-09-30' }), /재고 현황 Excel 원본 다운로드 시간이 60초를 초과/);
    assert.equal(signal?.aborted, true);
  }, true);
});

test('Statistics creation JSON cannot stall beyond its thirty-second deadline', async () => {
  let signal: AbortSignal | undefined;
  await withCoreEnvironment(async () => {
    globalThis.fetch = async (_input, init) => { signal = init?.signal as AbortSignal; return coreStalledBody('application/json'); };
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'salesStatistics', targetDate: '2026-09-30' }), /판매 현황 Excel 생성 요청 시간이 30초를 초과/);
    assert.equal(signal?.aborted, true);
  }, true);
});

test('Statistics original body has its own sixty-second deadline after generation completes', async () => {
  let signal: AbortSignal | undefined;
  await withCoreEnvironment(async () => {
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      assert.ok(init?.signal instanceof AbortSignal);
      if (path.includes('request-auto-download')) return coreJson({ requestedDownloadId: 'req' });
      if (path.includes('check-downloadable')) return coreJson({ status: 'COMPLETED', downloadIds: ['file'] });
      signal = init.signal;
      return coreStalledBody('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    };
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'salesStatistics', targetDate: '2026-09-30' }), /판매 현황 Excel 원본 다운로드 시간이 60초를 초과/);
    assert.equal(signal?.aborted, true);
  }, true);
});

test('Statistics generation stops at thirty polls and ninety seconds', async () => {
  await withCoreEnvironment(async ({ delays }) => {
    let polls = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes('request-auto-download')) return coreJson({ requestedDownloadId: 'req' });
      polls += 1; return coreJson({ status: 'PENDING' });
    };
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'salesStatistics', targetDate: '2026-09-30' }), /판매 현황 Excel 생성이 제한 시간/);
    assert.equal(polls, 30);
    assert.equal(delays.reduce((sum, ms) => sum + ms, 0), 90_000);
  });
});

test('product generation accepts a completed original on its ninetieth poll', async () => {
  await withCoreEnvironment(async ({ delays }) => {
    let description = '';
    let polls = 0;
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      assert.ok(init?.signal instanceof AbortSignal);
      if (path.includes('create/validate')) return coreJson({});
      if (path.includes('create/vendor-inventory')) { description = JSON.parse(String(init.body)).fileDescription; return coreJson({}); }
      if (path.includes('download/list')) {
        if (!description) return coreJson({ result: [] });
        polls += 1;
        return coreJson({ result: [{ fileDescription: description, status: polls === 90 ? 'COMPLETED' : 'PENDING', sellerRequestDownloadExcelId: 123 }] });
      }
      return coreOriginal();
    };
    const downloaded = await downloadAbrsCoupangLedgerFile({ slot: 'productList', targetDate: '2026-09-30' });
    assert.equal(polls, 90);
    assert.equal(delays.reduce((sum, ms) => sum + ms, 0), 178_000);
    assert.equal(normalizeAbrsCoupangDownloads(downloaded)[0].fileName, `${description}.xlsx`);
  });
});

test('product generation wall deadline includes network time instead of permitting ninety slow polls', async () => {
  await withCoreEnvironment(async ({ advance, delays }) => {
    let description = '';
    let polls = 0;
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      if (path.includes('create/validate')) return coreJson({});
      if (path.includes('create/vendor-inventory')) { description = JSON.parse(String(init?.body)).fileDescription; return coreJson({}); }
      if (!description) return coreJson({ result: [] });
      polls += 1; advance(10_000);
      return coreJson({ result: [{ fileDescription: description, status: 'PENDING' }] });
    };
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'productList', targetDate: '2026-09-30' }), /상품 리스트 Excel 생성이 제한 시간/);
    assert.equal(polls, 15);
    assert.equal(delays.reduce((sum, ms) => sum + ms, 0) + polls * 10_000, 180_000);
  });
});

test('product validation request and its original body both have bounded deadlines', async () => {
  for (const stalledStage of ['validation', 'original']) {
    let signal: AbortSignal | undefined;
    await withCoreEnvironment(async () => {
      let description = '';
      globalThis.fetch = async (input, init) => {
        const path = String(input);
        if (path.includes('create/validate')) {
          if (stalledStage === 'validation') { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}); }
          return coreJson({});
        }
        if (path.includes('create/vendor-inventory')) { description = JSON.parse(String(init?.body)).fileDescription; return coreJson({}); }
        if (path.includes('download/list')) return coreJson({ result: description ? [{ fileDescription: description, status: 'COMPLETED', sellerRequestDownloadExcelId: 123 }] : [] });
        signal = init?.signal as AbortSignal;
        return coreStalledBody('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      };
      await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'productList', targetDate: '2026-09-30' }),
        stalledStage === 'validation' ? /상품 리스트 Excel 요청 확인 시간이 30초를 초과/ : /상품 리스트 Excel 원본 다운로드 시간이 60초를 초과/);
      assert.equal(signal?.aborted, true);
    }, true);
  }
});

test('a new product request never downloads a completed same-day file from before the request', async () => {
  await withCoreEnvironment(async ({ delays }) => {
    const description = createProductListDownloadRequest().fileDescription;
    let created = false;
    let newPolls = 0;
    globalThis.fetch = async (input) => {
      const path = String(input);
      if (path.includes('create/validate')) return coreJson({});
      if (path.includes('create/vendor-inventory')) { created = true; return coreJson({}); }
      if (path.includes('download/list')) {
        if (created) newPolls += 1;
        const oldItem = { fileDescription: description, status: 'COMPLETED', sellerRequestDownloadExcelId: 100 };
        const newItem = { fileDescription: description, status: newPolls < 3 ? 'PENDING' : 'COMPLETED', sellerRequestDownloadExcelId: 101 };
        return coreJson({ result: !created || newPolls === 1 ? [oldItem] : [newItem, oldItem] });
      }
      assert.equal(new URL(path).searchParams.get('sellerRequestDownloadExcelId'), '101');
      return coreOriginal();
    };
    await downloadAbrsCoupangLedgerFile({ slot: 'productList', targetDate: '2026-09-30' });
    assert.equal(newPolls, 3);
    assert.deepEqual(delays, [2000, 2000]);
  });
});

test('Statistics reports generation failure immediately instead of waiting ninety seconds', async () => {
  await withCoreEnvironment(async ({ delays }) => {
    let polls = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes('request-auto-download')) return coreJson({ requestedDownloadId: 'req' });
      polls += 1;
      return coreJson({ status: 'FAILED' });
    };
    await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'salesStatistics', targetDate: '2026-09-30' }), /판매 현황 Excel 생성에 실패/);
    assert.equal(polls, 1);
    assert.deepEqual(delays, []);
  });
});

test('Statistics downloads every generated part and retains each original filename and bytes', async () => {
  await withCoreEnvironment(async () => {
    const requestedFiles: string[] = [];
    const bytes = createDailySettlementWorkbookBytes({});
    globalThis.fetch = async (input) => {
      const path = String(input);
      if (path.includes('request-auto-download')) return coreJson({ requestedDownloadId: 'req' });
      if (path.includes('check-downloadable')) return coreJson({ status: 'COMPLETED', downloadIds: ['part0', 'part1', 'part0'] });
      requestedFiles.push(path);
      const index = path.endsWith('/part0') ? 0 : 1;
      return new Response(bytes, { headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="Statistics-20260930~20260930_(${index}).xlsx"`,
      } });
    };
    const downloaded = normalizeAbrsCoupangDownloads(await downloadAbrsCoupangLedgerFile({
      slot: 'salesStatistics', targetDate: '2026-09-30', periodStart: '2026-09-30', periodEnd: '2026-09-30',
    }));
    assert.deepEqual(requestedFiles, ['/fcc/download-manager/download/req/part0', '/fcc/download-manager/download/req/part1']);
    assert.deepEqual(downloaded.map((file) => file.fileName), ['Statistics-20260930~20260930_(0).xlsx', 'Statistics-20260930~20260930_(1).xlsx']);
    assert.ok(downloaded.every((file) => file.slot === 'salesStatistics'));
    assert.ok(downloaded.every((file) => Buffer.from(file.base64, 'base64').equals(Buffer.from(bytes))));
  });
});

test('inventory rejects successful HTTP responses containing non-Excel or truncated originals', async () => {
  const workbook = createDailySettlementWorkbookBytes({});
  for (const bytes of [new Uint8Array([1, 2, 3, 4]), workbook.slice(0, -22)]) {
    await withCoreEnvironment(async () => {
      globalThis.fetch = async () => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
      await assert.rejects(downloadAbrsCoupangLedgerFile({ slot: 'inventoryHealth', targetDate: '2026-09-30' }), /Excel 원본 형식/);
    });
  }
});

test('monthly Statistics collects separate daily originals including header-only empty days', async () => {
  await withCoreEnvironment(async () => {
    const requestedDates: string[] = [];
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      if (path.includes('request-auto-download')) {
        const predicate = JSON.parse((init?.body as URLSearchParams).get('predicate') ?? '{}');
        assert.equal(predicate.dateFrom, predicate.dateTo, 'A monthly total cannot recover individual daily sales');
        requestedDates.push(predicate.dateFrom);
        return coreJson({ requestedDownloadId: predicate.dateFrom });
      }
      if (path.includes('check-downloadable')) return coreJson({ status: 'COMPLETED', downloadIds: ['part0'] });
      // A valid header-only workbook is still an original, even when there are no sales.
      return coreOriginal();
    };
    const downloaded = normalizeAbrsCoupangDownloads(await downloadAbrsCoupangLedgerFile({
      slot: 'salesStatistics', targetDate: '2026-09-30', periodStart: '2026-09-01', periodEnd: '2026-09-30',
    }));
    const days = Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`);
    assert.deepEqual(requestedDates, days);
    assert.deepEqual(downloaded.map((file) => file.fileName), days.map((day) => `Statistics-${day.replaceAll('-', '')}~${day.replaceAll('-', '')}_(0).xlsx`));
    assert.ok(downloaded.every((file) => file.slot === 'salesStatistics' && file.base64));
  });
});

test('one daily Statistics failure rejects the monthly slot and stops further dates', async () => {
  await withCoreEnvironment(async () => {
    const requestedDates: string[] = [];
    globalThis.fetch = async (input, init) => {
      const path = String(input);
      if (path.includes('request-auto-download')) {
        const predicate = JSON.parse((init?.body as URLSearchParams).get('predicate') ?? '{}');
        requestedDates.push(predicate.dateFrom);
        return coreJson({ requestedDownloadId: predicate.dateFrom });
      }
      if (path.includes('check-downloadable')) {
        const day = new URL(path).searchParams.get('requestId');
        return coreJson(day === '2026-09-02' ? { status: 'FAILED' } : { status: 'COMPLETED', downloadIds: ['part0'] });
      }
      return coreOriginal();
    };
    await assert.rejects(downloadAbrsCoupangLedgerFile({
      slot: 'salesStatistics', targetDate: '2026-09-30', periodStart: '2026-09-01', periodEnd: '2026-09-30',
    }), /판매 현황 Excel 생성에 실패/);
    assert.deepEqual(requestedDates, ['2026-09-01', '2026-09-02']);
  });
});
