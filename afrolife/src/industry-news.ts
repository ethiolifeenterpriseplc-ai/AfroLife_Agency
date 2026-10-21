import { isIP } from 'node:net';

export const INDUSTRY_NEWS_FEEDS = [
  {
    category: 'business',
    label: 'Business & finance',
    url: 'https://news.google.com/rss/search?q=Ethiopia+business+finance+banking+when%3A30d&hl=en-ET&gl=ET&ceid=ET%3Aen',
  },
  {
    category: 'property',
    label: 'Property & housing',
    url: 'https://news.google.com/rss/search?q=Ethiopia+housing+real+estate+property+when%3A30d&hl=en-ET&gl=ET&ceid=ET%3Aen',
  },
  {
    category: 'workforce',
    label: 'Workforce & employment',
    url: 'https://news.google.com/rss/search?q=Ethiopia+jobs+employment+labour+workforce+when%3A30d&hl=en-ET&gl=ET&ceid=ET%3Aen',
  },
  {
    category: 'technology',
    label: 'Technology & digital',
    url: 'https://news.google.com/rss/search?q=Ethiopia+technology+digital+economy+telecom+when%3A30d&hl=en-ET&gl=ET&ceid=ET%3Aen',
  },
] as const;

export type IndustryNewsCategory = (typeof INDUSTRY_NEWS_FEEDS)[number]['category'];

export type IndustryNewsArticle = {
  category: IndustryNewsCategory;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
};

export type IndustryNewsResponse = {
  articles: IndustryNewsArticle[];
  updatedAt: string | null;
  stale: boolean;
  status: 'updated' | 'partial' | 'unavailable';
  unavailableFeeds: number;
};

const MAX_FEED_BYTES = 512 * 1024;
const MAX_ARTICLES = 24;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 12 * 60 * 1000;
export const INDUSTRY_NEWS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const RSS_ACCEPT = 'application/rss+xml, application/xml, text/xml;q=0.9';

function decodeXml(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, token: string) => {
    if (token[0] === '#') {
      const hex = token[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : '';
    }
    return entities[token.toLowerCase()] ?? '';
  });
}

function plainText(value: string, maxLength: number): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const withoutMarkup = withoutCdata.replace(/<[^>]*>/g, ' ');
  return decodeXml(decodeXml(withoutMarkup))
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function field(item: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const element = new RegExp(`<(?:(?:[\\w.-]+):)?${escapedName}\\b([^>]*)>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escapedName}\\s*>`, 'i')
    .exec(item);
  if (element) return element[2];
  if (name === 'link') {
    const atomLink = new RegExp(`<(?:(?:[\\w.-]+):)?${escapedName}\\b([^>]*?)(?:\\/\\s*>|>)`, 'i').exec(item);
    return atomLink?.[1]?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
  }
  return '';
}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host.includes('.')
    && !isIP(host.replace(/^\[|\]$/g, ''))
    && host !== 'localhost'
    && !host.endsWith('.localhost')
    && !host.endsWith('.local')
    && !host.endsWith('.internal')
    && !host.endsWith('.test')
    && !host.endsWith('.invalid');
}

export function isSafeArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && isPublicHostname(url.hostname)
      && !/^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(url.hostname);
  } catch {
    return false;
  }
}

export function parseRssFeed(
  xml: string,
  category: IndustryNewsCategory,
  now = new Date(),
): IndustryNewsArticle[] {
  if (Buffer.byteLength(xml, 'utf8') > MAX_FEED_BYTES
    || /<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const results: IndustryNewsArticle[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)) {
    const title = plainText(field(item, 'title'), 280);
    const source = plainText(field(item, 'source'), 100) || 'Google News';
    const urlText = plainText(field(item, 'link'), 2048);
    const url = isSafeArticleUrl(urlText) ? new URL(urlText).toString() : null;
    const timestamp = Date.parse(plainText(field(item, 'pubDate'), 100));
    if (!title || !url || !Number.isFinite(timestamp)
      || timestamp < now.getTime() - MAX_AGE_MS
      || timestamp > now.getTime() + MAX_FUTURE_MS) continue;
    results.push({
      category,
      title,
      url,
      source,
      publishedAt: new Date(timestamp).toISOString(),
    });
  }
  return results;
}

async function readLimitedFeed(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    throw new Error('Industry news feed exceeded the response limit');
  }
  if (!response.body) throw new Error('Industry news feed returned no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new Error('Industry news feed exceeded the response limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function uniqueArticles(articles: IndustryNewsArticle[]): IndustryNewsArticle[] {
  const seen = new Set<string>();
  return articles
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    })
    .slice(0, MAX_ARTICLES);
}

export function createIndustryNewsProvider(options: {
  fetcher?: typeof fetch;
  now?: () => Date;
  cacheTtlMs?: number;
} = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  let cache: IndustryNewsResponse | null = null;
  let cacheExpiresAt = 0;
  let refreshInFlight: Promise<IndustryNewsResponse> | null = null;
  const feedCache = new Map<IndustryNewsCategory, IndustryNewsArticle[]>();

  async function fetchFeed(feed: (typeof INDUSTRY_NEWS_FEEDS)[number]): Promise<IndustryNewsArticle[]> {
    const response = await fetcher(feed.url, {
      method: 'GET',
      headers: { accept: RSS_ACCEPT, 'user-agent': 'AfroLife-IndustryNews/1.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok || response.redirected || response.status >= 300 && response.status < 400) {
      throw new Error(`Industry news feed returned ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/xml|rss/i.test(contentType)) throw new Error('Industry news feed returned an unsupported content type');
    return parseRssFeed(await readLimitedFeed(response), feed.category, now());
  }

  async function refresh(): Promise<IndustryNewsResponse> {
    const completed = await Promise.all(INDUSTRY_NEWS_FEEDS.map(async (feed) => {
      try {
        return { category: feed.category, articles: await fetchFeed(feed) };
      } catch (error) {
        const cause = error && typeof error === 'object' && 'cause' in error
          ? error.cause
          : null;
        const code = cause && typeof cause === 'object' && 'code' in cause
          && typeof cause.code === 'string'
          ? cause.code
          : undefined;
        console.warn('AfroLife industry news feed request failed.', {
          category: feed.category,
          reason: error instanceof Error ? error.message : 'Unknown feed failure',
          ...(code ? { code } : {}),
        });
        return null;
      }
    }));
    const unavailableFeeds = completed.filter((result) => result === null).length;
    if (unavailableFeeds === INDUSTRY_NEWS_FEEDS.length) {
      if (cache?.updatedAt) {
        cache = {
          ...cache,
          stale: true,
          status: 'partial',
          unavailableFeeds,
        };
        cacheExpiresAt = now().getTime() + cacheTtlMs;
        return cache;
      }
      const unavailable: IndustryNewsResponse = {
        articles: [],
        updatedAt: null,
        stale: false,
        status: 'unavailable',
        unavailableFeeds,
      };
      cache = unavailable;
      cacheExpiresAt = now().getTime() + cacheTtlMs;
      return unavailable;
    }
    for (const result of completed) {
      if (result) feedCache.set(result.category, result.articles);
    }
    const updatedAt = now().toISOString();
    cache = {
      articles: uniqueArticles(INDUSTRY_NEWS_FEEDS.flatMap(({ category }) => feedCache.get(category) ?? [])),
      updatedAt,
      stale: false,
      status: unavailableFeeds ? 'partial' : 'updated',
      unavailableFeeds,
    };
    cacheExpiresAt = now().getTime() + cacheTtlMs;
    return cache;
  }

  return {
    async refreshNow(): Promise<IndustryNewsResponse> {
      if (!refreshInFlight) {
        refreshInFlight = refresh().finally(() => { refreshInFlight = null; });
      }
      return refreshInFlight;
    },
    async getLatest(): Promise<IndustryNewsResponse> {
      if (cache && now().getTime() < cacheExpiresAt) return cache;
      return this.refreshNow();
    },
  };
}

export function startIndustryNewsRefreshSchedule(
  provider: Pick<ReturnType<typeof createIndustryNewsProvider>, 'refreshNow'>,
  intervalMs = INDUSTRY_NEWS_REFRESH_INTERVAL_MS,
): () => void {
  let refreshing = false;
  const refresh = () => {
    if (refreshing) return;
    refreshing = true;
    void provider.refreshNow()
      .catch((error) => console.error('AfroLife scheduled industry news refresh failed.', error))
      .finally(() => { refreshing = false; });
  };
  refresh();
  const timer = setInterval(refresh, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
