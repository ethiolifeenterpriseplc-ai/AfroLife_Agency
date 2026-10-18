import { createServer } from 'node:https';
import { request as upstreamRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';

const bindAddress = process.env.AFROLIFE_LAN_HOST;
const allowedSubnet = process.env.AFROLIFE_LAN_SUBNET;
const pfxPath = process.env.AFROLIFE_LAN_PFX;
const pfxPassword = process.env.AFROLIFE_LAN_PFX_PASSWORD;
const upstreamPort = Number(process.env.AFROLIFE_LAN_UPSTREAM_PORT ?? 3000);
const port = Number(process.env.AFROLIFE_LAN_PORT ?? 8443);

if (!bindAddress || !allowedSubnet || !pfxPath || !pfxPassword || isIP(bindAddress) !== 4
    || !Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
  throw new Error('LAN bind IP, subnet, TLS certificate bundle, and password must be configured.');
}

function ipv4Number(address) {
  if (isIP(address) !== 4) return null;
  return address.split('.').reduce((number, part) => ((number << 8) | Number(part)) >>> 0, 0);
}

const [networkAddress, prefixText] = allowedSubnet.split('/');
const prefix = Number(prefixText);
if (isIP(networkAddress) !== 4 || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) {
  throw new Error('Allowed LAN subnet must be an IPv4 CIDR range.');
}
const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
const network = ipv4Number(networkAddress) & mask;

function isAllowedClient(address) {
  const ipv4 = address?.replace(/^::ffff:/, '');
  const value = ipv4Number(ipv4);
  return value !== null && (value & mask) === network;
}

const proxy = createServer({
  pfx: readFileSync(pfxPath),
  passphrase: pfxPassword,
}, (request, response) => {
  if (!isAllowedClient(request.socket.remoteAddress)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('This EthioLife preview is restricted to its local Wi-Fi network.');
    return;
  }

  const path = request.url ?? '/';
  if (path !== '/healthz' && !path.startsWith('/api/v1/')) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('Only the authenticated AfroLife API is available through this LAN preview.');
    return;
  }

  const upstream = upstreamRequest({
    host: '127.0.0.1',
    port: upstreamPort,
    method: request.method,
    path,
    headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'cache-control': 'no-store' });
    response.end('The local EthioLife API is not available.');
  });
  request.pipe(upstream);
});

proxy.listen(port, bindAddress, () => {
  console.log(`EthioLife HTTPS LAN preview listening on https://${bindAddress}:${port}; allowed subnet ${allowedSubnet}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => proxy.close(() => process.exit(0)));
}
