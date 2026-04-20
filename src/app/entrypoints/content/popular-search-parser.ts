import type {
  PopularItemSnapshot,
  PopularSearchSnapshot,
} from '@/shared/extension';

const MAX_POPULAR_ITEMS = 15;
const MISSING_INFO_MESSAGE =
  '\uD2B9\uC815 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.';
const WRONG_PAGE_MESSAGE =
  '\uC778\uAE30\uC0C1\uD488 \uAC80\uC0C9 \uACB0\uACFC \uD398\uC774\uC9C0\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uD574\uB2F9 \uD654\uBA74\uC5D0\uC11C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.';
const POPULARITY_SEARCH_IFRAME_KEYWORD = 'coupang-trends/popularity-search';
const KEYWORD_RESULT_SUFFIX = '\uD0A4\uC6CC\uB4DC \uAC80\uC0C9 \uACB0\uACFC';
const AVERAGE_PRICE_LABEL = '\uD3C9\uADE0\uAC00';
const PRICE_RANGE_LABEL = '\uAC00\uACA9\uBC94\uC704';
const MINIMUM_LABEL = '\uCD5C\uC18C';
const MAXIMUM_LABEL = '\uCD5C\uB300';
const BRAND_LABEL = '\uBE0C\uB79C\uB4DC\uBA85';
const MANUFACTURER_LABEL = '\uC81C\uC870\uC0AC';
const REVIEW_LABEL = '\uC0C1\uD488\uD3C9';
const PRICE_LABEL = '\uAC00\uACA9';
const VIEWS_LABEL = '\uC870\uD68C\uC218';
const SEARCH_KEYWORD_PARAM = 'keyword';

interface ParserTarget {
  source: 'top-document' | 'iframe-document';
  document: Document;
  href: string;
  iframeSrc: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function parseCommaNumber(value: string): number | null {
  const match = value.match(/\d[\d,]*(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsedValue = Number(match[0].replace(/,/g, ''));

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseCompactKoreanNumber(value: string): number | null {
  const sanitizedValue = value.replace(/\s+/g, '').replace(/,/g, '');

  if (!sanitizedValue) {
    return null;
  }

  let matched = false;
  let total = 0;
  let remainder = sanitizedValue;

  const unitMap: Array<[string, number]> = [
    ['\uC5B5', 100_000_000],
    ['\uB9CC', 10_000],
    ['\uCC9C', 1_000],
  ];

  for (const [unit, multiplier] of unitMap) {
    const unitRegex = new RegExp(`(\\d+(?:\\.\\d+)?)${unit}`, 'g');

    remainder = remainder.replace(unitRegex, (_match, numericValue: string) => {
      matched = true;
      total += Math.round(Number(numericValue) * multiplier);
      return '';
    });
  }

  const plainRemainder = remainder.replace(/[^0-9.]/g, '');

  if (plainRemainder) {
    matched = true;
    total += Number(plainRemainder);
  }

  return matched && Number.isFinite(total) ? total : null;
}

function parseViewsRange(value: string): [number, number] | null {
  const cleanedValue = normalizeText(value)
    .replace(new RegExp(VIEWS_LABEL, 'g'), '')
    .replace(/\uD68C/g, '')
    .trim();
  const rangeMatch = cleanedValue.match(
    /([0-9.,\uC5B5\uB9CC\uCC9C]+)\s*[-~]\s*([0-9.,\uC5B5\uB9CC\uCC9C]+)/,
  );

  if (rangeMatch) {
    const min = parseCompactKoreanNumber(rangeMatch[1]);
    const max = parseCompactKoreanNumber(rangeMatch[2]);

    if (min === null || max === null) {
      return null;
    }

    return [min, max];
  }

  const singleValue = parseCompactKoreanNumber(cleanedValue);

  return singleValue === null ? null : [singleValue, singleValue];
}

function getIframeCandidates(rootDocument: Document): HTMLIFrameElement[] {
  return Array.from(rootDocument.querySelectorAll<HTMLIFrameElement>('iframe'));
}

function getParserTarget(): ParserTarget {
  const iframeCandidates = getIframeCandidates(document);
  const popularitySearchIframe =
    iframeCandidates.find((element) =>
      (element.src || '').includes(POPULARITY_SEARCH_IFRAME_KEYWORD),
    ) ?? null;

  if (!popularitySearchIframe) {
    return {
      source: 'top-document',
      document,
      href: window.location.href,
      iframeSrc: null,
    };
  }

  try {
    const iframeDocument = popularitySearchIframe.contentDocument;
    const iframeWindow = popularitySearchIframe.contentWindow;

    if (!iframeDocument || !iframeWindow) {
      return {
        source: 'top-document',
        document,
        href: window.location.href,
        iframeSrc: popularitySearchIframe.src || null,
      };
    }

    return {
      source: 'iframe-document',
      document: iframeDocument,
      href: iframeWindow.location.href,
      iframeSrc: popularitySearchIframe.src || null,
    };
  } catch {
    return {
      source: 'top-document',
      document,
      href: window.location.href,
      iframeSrc: popularitySearchIframe.src || null,
    };
  }
}

function extractSearchKeyword(
  rootDocument: Document,
  parserTarget: ParserTarget,
): string | null {
  const keywordContainer =
    Array.from(rootDocument.querySelectorAll<HTMLElement>('span')).find(
      (element) =>
        normalizeText(element.textContent).endsWith(KEYWORD_RESULT_SUFFIX) &&
        element.querySelector('strong') !== null,
    ) ?? null;

  const keyword = normalizeText(
    keywordContainer?.querySelector('strong')?.textContent,
  ).replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '');

  if (keyword) {
    return keyword;
  }

  try {
    const url = new URL(parserTarget.href);
    const urlKeyword = normalizeText(
      url.searchParams.get(SEARCH_KEYWORD_PARAM) ??
        url.searchParams.get('searchKeywords'),
    );

    return urlKeyword || null;
  } catch {
    return null;
  }
}

function extractAverageCost(rootDocument: Document): number | null {
  const amountText = normalizeText(
    rootDocument.querySelector<HTMLElement>('span[class*="_avg-price-amount_"]')
      ?.textContent,
  );

  if (amountText) {
    return parseCommaNumber(amountText);
  }

  const titleElement =
    Array.from(rootDocument.querySelectorAll<HTMLElement>('div')).find(
      (element) =>
        normalizeText(element.textContent).startsWith(AVERAGE_PRICE_LABEL),
    ) ?? null;
  const titleContainer = titleElement?.parentElement ?? null;
  const nearbyAmountText = normalizeText(
    titleContainer?.querySelector<HTMLElement>('strong, span')?.textContent,
  );

  if (nearbyAmountText) {
    return parseCommaNumber(nearbyAmountText);
  }

  const bodyText = normalizeText(rootDocument.body?.textContent);
  const match = bodyText.match(
    new RegExp(`${AVERAGE_PRICE_LABEL}\\s*(\\d[\\d,]*)\\s*\uC6D0`),
  );

  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function extractCostRangeText(rootDocument: Document): string {
  const rangeText = normalizeText(
    rootDocument.querySelector<HTMLElement>('div[class*="_price-range_"]')
      ?.textContent,
  );

  if (rangeText) {
    return rangeText;
  }

  const bodyText = normalizeText(rootDocument.body?.textContent);
  const fallbackMatch = bodyText.match(
    new RegExp(
      `${MINIMUM_LABEL}\\s*[\\d,]+\\s*\uC6D0\\s*~\\s*${MAXIMUM_LABEL}\\s*[\\d,]+\\s*\uC6D0`,
    ),
  );

  return fallbackMatch?.[0] ?? '';
}

function extractCostRange(rootDocument: Document): [number, number] | null {
  const rangeText = extractCostRangeText(rootDocument);
  const match = rangeText.match(
    new RegExp(
      `${MINIMUM_LABEL}\\s*([\\d,]+)\\s*\uC6D0\\s*~\\s*${MAXIMUM_LABEL}\\s*([\\d,]+)\\s*\uC6D0`,
    ),
  );

  if (!match) {
    return null;
  }

  return [
    Number(match[1].replace(/,/g, '')),
    Number(match[2].replace(/,/g, '')),
  ];
}

function extractLabeledValue(root: ParentNode, label: string): string | null {
  const labelElement =
    Array.from(root.querySelectorAll<HTMLElement>('span')).find(
      (element) => normalizeText(element.textContent) === label,
    ) ?? null;

  if (!labelElement?.parentElement) {
    return null;
  }

  const siblingValue = normalizeText(labelElement.nextElementSibling?.textContent);

  if (siblingValue) {
    return siblingValue;
  }

  const container = labelElement.parentElement;
  const valueText = normalizeText(
    Array.from(container.children)
      .filter((element) => element !== labelElement)
      .map((element) => element.textContent ?? '')
      .join(' '),
  );

  return valueText || null;
}

function extractCategory(card: HTMLElement): string | null {
  const container =
    Array.from(card.querySelectorAll<HTMLElement>('div')).find(
      (element) => {
        const directChildren = Array.from(element.children);
        const hasDirectArrow = directChildren.some(
          (child) => child.tagName === 'I' && child.getAttribute('title') === 'arrow-right',
        );
        const hasDirectSpan = directChildren.some((child) => child.tagName === 'SPAN');

        return hasDirectArrow && hasDirectSpan;
      },
    ) ?? null;

  if (!container) {
    return null;
  }

  const categoryParts = Array.from(container.children)
    .filter((element) => element.tagName === 'SPAN')
    .map((element) => normalizeText(element.textContent))
    .filter(Boolean);

  return categoryParts.length > 0 ? categoryParts.join(' > ') : null;
}

function inspectPopularItemFields(card: HTMLElement): PopularItemSnapshot | null {
  const imgUrl = card.querySelector<HTMLImageElement>('img[src]')?.src ?? null;
  const name = normalizeText(
    card.querySelector<HTMLElement>('div[class*="_subject_"] span')?.textContent,
  );
  const category = extractCategory(card);
  const brand = extractLabeledValue(card, BRAND_LABEL);
  const manufacturer = extractLabeledValue(card, MANUFACTURER_LABEL);
  const rating = parseCommaNumber(extractLabeledValue(card, 'Rating') ?? '');
  const review = parseCommaNumber(extractLabeledValue(card, REVIEW_LABEL) ?? '');
  const cost = parseCommaNumber(extractLabeledValue(card, PRICE_LABEL) ?? '');
  const views = parseViewsRange(extractLabeledValue(card, VIEWS_LABEL) ?? '');

  if (
    !imgUrl ||
    !name ||
    !category ||
    !brand ||
    !manufacturer ||
    rating === null ||
    review === null ||
    cost === null ||
    views === null
  ) {
    return null;
  }

  return {
    imgUrl,
    name,
    category,
    brand,
    manufacturer,
    rating,
    review,
    cost,
    views,
  };
}

function createPopularItem(card: HTMLElement): PopularItemSnapshot | null {
  return inspectPopularItemFields(card);
}

export function extractPopularSearchSnapshot(): PopularSearchSnapshot {
  const parserTarget = getParserTarget();
  const rootDocument = parserTarget.document;
  const productCardElements = Array.from(
    rootDocument.querySelectorAll<HTMLElement>('div[class*="_product_card_"]'),
  );
  const keywordResultMatchCount = Array.from(
    rootDocument.querySelectorAll<HTMLElement>('span'),
  ).filter((element) =>
    normalizeText(element.textContent).endsWith(KEYWORD_RESULT_SUFFIX),
  ).length;
  const averagePriceTitleMatchCount = Array.from(
    rootDocument.querySelectorAll<HTMLElement>('div'),
  ).filter((element) =>
    normalizeText(element.textContent).startsWith(AVERAGE_PRICE_LABEL),
  ).length;
  const priceRangeTitleMatchCount = Array.from(
    rootDocument.querySelectorAll<HTMLElement>('div'),
  ).filter((element) =>
    normalizeText(element.textContent).startsWith(PRICE_RANGE_LABEL),
  ).length;

  if (
    keywordResultMatchCount === 0 &&
    averagePriceTitleMatchCount === 0 &&
    priceRangeTitleMatchCount === 0 &&
    productCardElements.length === 0
  ) {
    throw new Error(WRONG_PAGE_MESSAGE);
  }

  const searchKeyword = extractSearchKeyword(rootDocument, parserTarget);
  const averageCost = extractAverageCost(rootDocument);
  const costRange = extractCostRange(rootDocument);
  const parsedItems = productCardElements.map((card) => createPopularItem(card));
  const popularItems = parsedItems
    .filter((item): item is PopularItemSnapshot => item !== null)
    .slice(0, MAX_POPULAR_ITEMS);

  if (
    !searchKeyword ||
    averageCost === null ||
    costRange === null ||
    popularItems.length === 0
  ) {
    throw new Error(MISSING_INFO_MESSAGE);
  }

  return {
    searchKeyword,
    averageCost,
    costRange,
    popularItems,
  };
}
