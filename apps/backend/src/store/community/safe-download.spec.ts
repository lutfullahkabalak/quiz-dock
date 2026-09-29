import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { allowedUrl, downloadStore, publicAddress } from './safe-download';
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ request: jest.fn() }));
const dns = jest.mocked(lookup);
const http = jest.mocked(request);
const hosts = new Set(['store.example', 'assets.example']);
function respond(statusCode: number, body: string, headers: Record<string, string> = {}) {
  http.mockImplementationOnce(((
    _url: unknown,
    _options: unknown,
    callback: (res: unknown) => void,
  ) => {
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (err: Error) => void;
    };
    req.destroy = (err) => {
      req.emit('error', err);
      req.emit('close');
    };
    req.end = () => {
      const res = Object.assign(new PassThrough(), { statusCode, headers });
      callback(res);
      queueMicrotask(() => {
        res.end(body);
        req.emit('close');
      });
    };
    return req;
  }) as typeof request);
}
describe('store downloads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    dns.mockResolvedValue([{ address: '1.1.1.1', family: 4 }] as never);
  });
  it.each([
    'http://store.example/a',
    'https://store.example:444/a',
    'https://user:pass@store.example/a',
    'https://other.example/a',
    'https://store.example/a#fragment',
  ])('refuses %s', (value) => {
    expect(() => allowedUrl(value, hosts)).toThrow();
  });
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.102',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    'not-an-ip',
  ])('refuses non-public address %s', (address) => expect(publicAddress(address)).toBe(false));
  it('keeps DNS lookup within the remaining download deadline', async () => {
    jest.useFakeTimers();
    try {
      dns.mockImplementation(() => new Promise(() => {}));
      const request = downloadStore('https://store.example/a', hosts, 10, 20);
      const refused = expect(request).rejects.toThrow('Store DNS timeout');
      await jest.advanceTimersByTimeAsync(20);
      await refused;
      expect(http).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it('pins the checked DNS result to the socket', async () => {
    respond(200, 'quiz');
    expect((await downloadStore('https://store.example/a', hosts, 10)).toString()).toBe('quiz');
    const options = http.mock.calls[0][1] as {
      lookup: (hostname: string, options: unknown, cb: (...args: unknown[]) => void) => void;
    };
    const cb = jest.fn();
    options.lookup('store.example', {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '1.1.1.1', 4);
  });
  it('rejects a mixed public/private DNS answer before opening a socket', async () => {
    dns.mockResolvedValueOnce([
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(downloadStore('https://store.example/a', hosts, 10)).rejects.toThrow('Non-public');
    expect(http).not.toHaveBeenCalled();
  });
  it('follows an allowed redirect and resolves its target again', async () => {
    respond(302, '', { location: 'https://assets.example/a' });
    respond(200, 'quiz');
    await expect(downloadStore('https://store.example/a', hosts, 10)).resolves.toEqual(
      Buffer.from('quiz'),
    );
    expect(dns).toHaveBeenNthCalledWith(2, 'assets.example', { all: true, verbatim: true });
  });
  it('refuses redirects outside the allowlist', async () => {
    respond(302, '', { location: 'https://evil.example/a' });
    await expect(downloadStore('https://store.example/a', hosts, 10)).rejects.toThrow('Disallowed');
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('bounds actual streamed bytes even without content-length', async () => {
    respond(200, '12345678901');
    await expect(downloadStore('https://store.example/a', hosts, 10)).rejects.toThrow('too large');
  });
});
