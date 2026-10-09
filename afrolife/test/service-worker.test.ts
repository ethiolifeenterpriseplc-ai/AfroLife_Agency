import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function bootWorker() {
  const listeners = new Map<string, (event: any) => void>();
  const cacheEntries = new Map<string, Response>();
  const writes: string[] = [];
  const cache = {
    async addAll(paths: string[]) {
      for (const path of paths) cacheEntries.set(path, new Response(`cached shell ${path}`));
    },
    async put(path: string, response: Response) {
      writes.push(path);
      cacheEntries.set(path, response);
    },
    async match(path: string) { return cacheEntries.get(path) ?? null; },
  };
  runInNewContext(workerSource, {
    self: {
      location: { origin: 'https://afrolife.test' },
      addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    },
    caches: {
      open: async () => cache,
      keys: async () => ['afrolife-shell-v11', 'other-application-cache'],
      delete: async () => true,
    },
    fetch: async (request: Request) => new Response(`network ${new URL(request.url).pathname}`),
    URL,
    Response,
    Set,
    Promise,
  });
  return { listeners, cacheEntries, writes };
}

test('service worker caches only public allow-listed shell assets', async () => {
  const worker = bootWorker();
  const listener = worker.listeners.get('fetch')!;
  const privateRequest = new Request('https://afrolife.test/contract-documents/private-id/file');
  let privateIntercepted = false;
  listener({ request: privateRequest, respondWith: () => { privateIntercepted = true; } });
  assert.equal(privateIntercepted, false);

  const apiRequest = new Request('https://afrolife.test/api/v1/mfi/institutions');
  let apiIntercepted = false;
  listener({ request: apiRequest, respondWith: () => { apiIntercepted = true; } });
  assert.equal(apiIntercepted, false);

  const protectedShellRequest = new Request('https://afrolife.test/app.js', {
    headers: { authorization: 'Bearer local-test-token' },
  });
  let protectedIntercepted = false;
  listener({ request: protectedShellRequest, respondWith: () => { protectedIntercepted = true; } });
  assert.equal(protectedIntercepted, false);

  const staticRequest = new Request('https://afrolife.test/mfi.js');
  let staticResponse: Promise<Response> | undefined;
  listener({ request: staticRequest, respondWith: (response: Promise<Response>) => { staticResponse = response; } });
  assert.ok(staticResponse);
  await staticResponse;
  assert.deepEqual(worker.writes, ['/mfi.js']);
  assert.equal(worker.cacheEntries.has('/contract-documents/private-id/file'), false);
});
