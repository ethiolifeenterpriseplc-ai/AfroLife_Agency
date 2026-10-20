import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createIndustryNewsProvider,
  INDUSTRY_NEWS_FEEDS,
  isSafeArticleUrl,
  parseRssFeed,
} from '../src/industry-news.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

function rssItem({
  title = 'Ethiopia expands a new industry',
  link = 'https://publisher.example/article/1',
  source = 'Ethiopia Business Daily',
  published = 'Tue, 20 Oct 2026 10:00:00 GMT',
} = {}) {
  return `<item><title>${title}</title><link>${link}</link><source>${source}</source><pubDate>${published}</pubDate></item>`;
}

function response(xml: string, status = 200, contentType = 'application/rss+xml; charset=utf-8') {
  return new Response(xml, { status, headers: { 'content-type': contentType } });
}

test('RSS parser normalizes current publisher data and ignores unsafe, malformed, and old articles', () => {
  const xml = `<rss><channel>
    ${rssItem({ title: 'Banks &amp; businesses grow', source: 'Daily &amp; More' })}
    ${rssItem({ title: 'Old report', link: 'https://publisher.example/old', published: 'Tue, 1 Jan 2019 10:00:00 GMT' })}
    ${rssItem({ title: 'Unsafe', link: 'http://publisher.example/story' })}
    ${rssItem({ title: 'No date', published: 'not a date' })}
    ${rssItem({ title: '<![CDATA[Housing &amp; jobs]]>', link: 'javascript:alert(1)' })}
  </channel></rss>`;
  assert.deepEqual(parseRssFeed(xml, 'business', NOW), [{
    category: 'business',
    title: 'Banks & businesses grow',
    url: 'https://publisher.example/article/1',
    source: 'Daily & More',
    publishedAt: '2026-10-20T10:00:00.000Z',
  }]);
  assert.deepEqual(parseRssFeed(`<!DOCTYPE rss [<!ENTITY x "bad">]><rss>${rssItem()}</rss>`, 'property', NOW), []);
  assert.deepEqual(parseRssFeed(`${rssItem()}`.repeat(30000), 'property', NOW), []);
});

test('published article links must be public HTTPS URLs without credentials or unsafe hosts', () => {
  for (const url of [
    'https://news.google.com/rss/articles/abc',
    'https://publisher.example/article?id=1&source=news',
  ]) assert.equal(isSafeArticleUrl(url), true, url);
  for (const url of [
    'http://publisher.example/article',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:pass@publisher.example/article',
    'https://localhost/article',
    'https://127.0.0.1/article',
    'https://192.168.1.20/article',
    'https://publisher.local/article',
    'https://publisher.example:8443/article',
    'not a URL',
  ]) assert.equal(isSafeArticleUrl(url), false, url);
});

test('news provider uses only fixed HTTPS RSS sources, normalizes results, and caches the aggregate', async () => {
  let now = new Date(NOW);
  const requested: Array<{ url: string; init?: RequestInit }> = [];
  const provider = createIndustryNewsProvider({
    now: () => now,
    fetcher: async (url, init) => {
      requested.push({ url, init });
      const category = INDUSTRY_NEWS_FEEDS.find((feed) => feed.url === url)?.category ?? 'business';
      return response(`<rss><channel>${rssItem({
        title: `${category} headline`,
        link: `https://publisher.example/${category}`,
      })}</channel></rss>`);
    },
  });
  const first = await provider.getLatest();
  assert.equal(first.status, 'updated');
  assert.equal(first.articles.length, 4);
  assert.equal(first.articles[0].publishedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(first.updatedAt, NOW.toISOString());
  assert.equal(first.articles.some((article) => JSON.stringify(article).includes('<rss>')), false);
  assert.deepEqual(requested.map(({ url }) => url), INDUSTRY_NEWS_FEEDS.map(({ url }) => url));
  assert.ok(requested.every(({ url, init }) => url.startsWith('https://')
    && init?.redirect === 'manual'
    && init?.signal instanceof AbortSignal
    && new URL(url).hostname === 'news.google.com'));

  now = new Date(NOW.getTime() + 60_000);
  assert.deepEqual(await provider.getLatest(), first);
  assert.equal(requested.length, INDUSTRY_NEWS_FEEDS.length);
});

test('feed failures return an honest unavailable state, then retain last-good data as stale', async () => {
  let now = new Date(NOW);
  let fail = false;
  let requestCount = 0;
  const provider = createIndustryNewsProvider({
    now: () => now,
    cacheTtlMs: 1000,
    fetcher: async (_url, init) => {
      requestCount += 1;
      assert.equal(init?.redirect, 'manual');
      if (fail) return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/' } });
      return response(`<rss><channel>${rssItem()}</channel></rss>`);
    },
  });

  const initial = await provider.getLatest();
  assert.equal(initial.articles.length, 1);
  assert.equal(initial.status, 'updated');
  now = new Date(NOW.getTime() + 2000);
  fail = true;
  const stale = await provider.getLatest();
  assert.equal(stale.stale, true);
  assert.equal(stale.status, 'partial');
  assert.equal(stale.updatedAt, initial.updatedAt);
  assert.deepEqual(stale.articles, initial.articles);
  assert.equal(requestCount, INDUSTRY_NEWS_FEEDS.length * 2);

  const unavailableProvider = createIndustryNewsProvider({
    fetcher: async () => response('upstream html', 200, 'text/html'),
  });
  const unavailable = await unavailableProvider.getLatest();
  assert.deepEqual(unavailable.articles, []);
  assert.equal(unavailable.updatedAt, null);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.unavailableFeeds, INDUSTRY_NEWS_FEEDS.length);
});

test('partial feed failures retain successful prior coverage and disclose the incomplete refresh', async () => {
  let now = new Date(NOW);
  let partial = false;
  const provider = createIndustryNewsProvider({
    now: () => now,
    cacheTtlMs: 1000,
    fetcher: async (url) => {
      const feed = INDUSTRY_NEWS_FEEDS.find(({ url: feedUrl }) => feedUrl === url)!;
      if (partial && feed.category !== 'business') return response('feed unavailable', 503);
      return response(`<rss><channel>${rssItem({
        title: `${feed.category} headline`,
        link: `https://publisher.example/${feed.category}`,
      })}</channel></rss>`);
    },
  });
  const first = await provider.getLatest();
  assert.equal(first.articles.length, 4);
  now = new Date(NOW.getTime() + 2000);
  partial = true;
  const refreshed = await provider.getLatest();
  assert.equal(refreshed.status, 'partial');
  assert.equal(refreshed.stale, false);
  assert.equal(refreshed.unavailableFeeds, 3);
  assert.deepEqual(refreshed.articles, first.articles);
});

test('feed redirects and oversized responses are rejected and cannot replace the last-good cache', async () => {
  for (const badResponse of [
    () => new Response(null, { status: 307, headers: { location: 'https://unexpected.example/feed' } }),
    () => response('x'.repeat(512 * 1024 + 1)),
  ]) {
    const provider = createIndustryNewsProvider({ fetcher: async () => badResponse() });
    const unavailable = await provider.getLatest();
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.articles.length, 0);
  }
});

test('landing news section includes honest loading, filters, and safe Google News fallbacks', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(html, /Ethiopia, in the headlines/);
  assert.match(html, /id="industry-news-results"[^>]*aria-busy="true"/);
  assert.match(app, /fetch\('\/api\/public\/industry-news'/);
  assert.match(app, /link\.target = '_blank';[\s\S]*?link\.rel = 'noopener noreferrer';/);
  assert.ok(server.indexOf("app.get('/api/public/industry-news'") < server.indexOf('api.use(authenticate)'));
  for (const category of ['business', 'property', 'workforce', 'technology']) {
    assert.match(html, new RegExp(`data-news-filter="${category}"`));
  }
  const fallback = html.slice(html.indexOf('id="industry-news-fallback"'), html.indexOf('</div>', html.indexOf('id="industry-news-fallback"')));
  assert.match(fallback, /google\.com\/search/);
  assert.match(fallback, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(fallback, /<strong>/);
});
