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
/** Bundle URLs are trusted only within the source index's own directory. */
export function sourceBase(index: string): URL {
  return new URL('.', index);
}
export function allowedArtifactUrl(value: string, base: URL): URL {
  const url = new URL(value);
  const decoded = decodeURIComponent(url.pathname);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname) ||
    /%2f|%5c/i.test(url.pathname) ||
    decoded.split('/').some((part) => part === '..' || part === '.')
  )
    throw new Error('Bundle outside source base');
  return url;
}

/** The asset CDN is a transfer hop, never a source an index can name directly. */
export function artifactRedirect(value: string, current: URL, base: URL, hosts: Set<string>): URL {
  const url = allowedUrl(value, hosts);
  if (url.origin === base.origin) return allowedArtifactUrl(url.href, base);
  // Other origins must be explicitly allowed, and reached through the source
  // or that same transfer host; another repository on the source host is refused.
  if (
    url.hostname === base.hostname ||
    (current.origin !== base.origin && url.origin !== current.origin)
  )
    throw new Error('Bundle redirect outside source');
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
  base?: URL,
): Promise<Buffer> {
  const deadline = Date.now() + Math.min(timeoutMs, 15_000);
  let url = allowedUrl(value, hosts);
  if (base) allowedArtifactUrl(url.href, base);
  for (let redirect = 0; redirect <= 4; redirect++) {
    if (Date.now() >= deadline) throw new Error('Store timeout');
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(
          () => reject(new Error('Store DNS timeout')),
          Math.max(1, Math.min(3000, deadline - Date.now())),
        );
        dnsTimer.unref();
      }),
    ]).finally(() => clearTimeout(dnsTimer));
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
    const next = new URL(response.location!, url).href;
    url = base ? artifactRedirect(next, url, base, hosts) : allowedUrl(next, hosts);
  }
  throw new Error('Too many store redirects');
}
