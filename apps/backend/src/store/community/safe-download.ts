import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import * as ipaddr from 'ipaddr.js';

export function allowedUrl(value: string, hosts: Set<string>): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    !hosts.has(url.hostname.toLowerCase())
  )
    throw new Error('Disallowed store URL');
  return url;
}
export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

/** Resolve once, reject every non-public answer, and pin the checked IP to the socket (no DNS rebinding). */
export async function downloadStore(
  value: string,
  hosts: Set<string>,
  maxBytes: number,
  timeoutMs = 15_000,
): Promise<Buffer> {
  const deadline = Date.now() + Math.min(timeoutMs, 15_000);
  let url = allowedUrl(value, hosts);
  for (let redirect = 0; redirect <= 4; redirect++) {
    if (Date.now() >= deadline) throw new Error('Store timeout');
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Store DNS timeout')), 3000);
        timer.unref();
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error('Non-public store address');
    const address = addresses[0];
    const response = await new Promise<{ bytes?: Buffer; location?: string }>((resolve, reject) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reject(new Error('Store timeout'));
        return;
      }
      const req = request(
        url,
        {
          agent: false,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: {
            Accept: 'application/json, application/zip',
            'Accept-Encoding': 'identity',
            'User-Agent': 'QuizDock-community-store',
          },
        },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            const location = res.headers.location;
            res.destroy();
            resolve({ location });
            return;
          }
          if (
            res.statusCode !== 200 ||
            (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') ||
            Number(res.headers['content-length'] ?? 0) > maxBytes
          ) {
            res.destroy();
            reject(new Error('Store response refused'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              res.destroy(new Error('Store response too large'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve({ bytes: Buffer.concat(chunks, size) }));
          res.on('error', reject);
          res.on('aborted', () => reject(new Error('Store response aborted')));
        },
      );
      const timer = setTimeout(() => req.destroy(new Error('Store timeout')), remaining);
      req.on('close', () => clearTimeout(timer));
      req.on('error', reject);
      req.end();
    });
    if (response.bytes) return response.bytes;
    url = allowedUrl(new URL(response.location!, url).href, hosts);
  }
  throw new Error('Too many store redirects');
}
