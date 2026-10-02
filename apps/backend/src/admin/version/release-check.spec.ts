import {
  CHECK_EVERY_S,
  RELEASES_URL,
  RETRY_AFTER_S,
  ReleaseCheck,
  isNewer,
  readRelease,
  releaseItems,
  versionStatus,
} from './release-check';

const BODY = `## What's Changed
* feat(store): add optional community catalogue by @lutfullahkabalak in https://github.com/quizdock/quiz-dock/pull/152
* Merge dev into main: community catalogue by @fchaussin in https://github.com/quizdock/quiz-dock/pull/182
* fix(api): answer the application's own pages only by @fchaussin in https://github.com/quizdock/quiz-dock/pull/185

## New Contributors
* @lutfullahkabalak made their first contribution in https://github.com/quizdock/quiz-dock/pull/152

**Full Changelog**: https://github.com/quizdock/quiz-dock/compare/v0.12.0...v0.13.0

## Upgrading

- **Migrations**: two new tables.
- Details: \`docs/self-hosting/upgrading.md\`.`;

const RELEASE = {
  tag_name: 'v0.13.1',
  published_at: '2026-10-02T18:09:17Z',
  html_url: 'https://github.com/quizdock/quiz-dock/releases/tag/v0.13.1',
  draft: false,
  prerelease: false,
  body: BODY,
};

/** A Redis that keeps what it is given, and the expiry asked. */
function memoryRedis(start: Record<string, string> = {}) {
  const store = new Map(Object.entries(start));
  const ttl = new Map<string, number>();
  return {
    store,
    ttl,
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string, _ex: 'EX', seconds: number) => {
      store.set(key, value);
      ttl.set(key, seconds);
      return Promise.resolve('OK' as const);
    }),
  };
}

const answering = (status: number, json: unknown = RELEASE) =>
  jest.fn(() => Promise.resolve(new Response(JSON.stringify(json), { status })));

describe('isNewer', () => {
  it.each([
    ['0.13.1', '0.13.0', true],
    ['0.14.0', '0.13.9', true],
    ['1.0.0', '0.99.0', true],
    ['0.13.0', '0.13.0', false],
    ['0.12.9', '0.13.0', false],
    ['0.13.0', '0.13.0-rc.1', true],
    ['0.13.0', 'dev', false],
  ])('%s after %s: %s', (latest, current, expected) => {
    expect(isNewer(latest, current)).toBe(expected);
  });
});

describe('releaseItems', () => {
  it('keeps the changes without author nor link, the merges out, and the upgrading notes', () => {
    expect(releaseItems(BODY)).toEqual({
      changes: [
        'feat(store): add optional community catalogue',
        "fix(api): answer the application's own pages only",
      ],
      upgrading: ['**Migrations**: two new tables.', 'Details: `docs/self-hosting/upgrading.md`.'],
    });
  });
});

describe('readRelease', () => {
  it('reads a stable release, its tag as the image tag', () => {
    expect(readRelease(RELEASE)).toMatchObject({
      version: '0.13.1',
      publishedAt: '2026-10-02T18:09:17Z',
      url: RELEASE.html_url,
    });
  });

  it('leaves out a pre-release, a draft and an unreadable tag', () => {
    expect(readRelease({ ...RELEASE, prerelease: true })).toBeNull();
    expect(readRelease({ ...RELEASE, draft: true })).toBeNull();
    expect(readRelease({ ...RELEASE, tag_name: 'v0.14.0-rc.1' })).toBeNull();
    expect(readRelease({ ...RELEASE, tag_name: 'nightly' })).toBeNull();
  });
});

describe('ReleaseCheck', () => {
  const now = () => new Date('2026-10-03T08:00:00Z');

  it('asks GitHub once, then answers from Redis for a day', async () => {
    const redis = memoryRedis();
    const fetchFn = answering(200);
    const check = new ReleaseCheck(redis, fetchFn, now);
    await check.latest('0.13.0');
    const second = await check.latest('0.13.0');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(RELEASES_URL, expect.anything());
    expect([...redis.ttl.values()]).toEqual([CHECK_EVERY_S]);
    expect(second).toMatchObject({
      release: { version: '0.13.1' },
      checkedAt: now().toISOString(),
    });
  });

  it('keeps a failure an hour only, without throwing', async () => {
    const redis = memoryRedis();
    const check = new ReleaseCheck(redis, answering(503), now);
    await expect(check.latest('0.13.0')).resolves.toMatchObject({ release: null, failed: true });
    expect([...redis.ttl.values()]).toEqual([RETRY_AFTER_S]);
  });

  it('takes a repository without a release as an answer', async () => {
    const check = new ReleaseCheck(memoryRedis(), answering(404, {}), now);
    await expect(check.latest('0.13.0')).resolves.toEqual({
      release: null,
      checkedAt: now().toISOString(),
    });
  });

  it('still answers when Redis is down', async () => {
    const redis = {
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
    };
    const check = new ReleaseCheck(redis, answering(200), now);
    await expect(check.latest('0.13.0')).resolves.toMatchObject({
      release: { version: '0.13.1' },
    });
  });
});

describe('versionStatus', () => {
  const now = () => new Date('2026-10-03T08:00:00Z');

  it('says an update is available, and the command that installs it', async () => {
    const check = new ReleaseCheck(memoryRedis(), answering(200), now);
    const status = await versionStatus(true, check, '0.13.0');
    expect(status).toMatchObject({ current: '0.13.0', check: 'on', updateAvailable: true });
    expect(status.output.map((e) => ('text' in e ? e.text : ''))).toEqual([
      'QuizDock 0.13.0',
      'Latest stable: 0.13.1',
      'Update available: ./quizdock upgrade 0.13.1',
    ]);
  });

  it('says it is up to date', async () => {
    const check = new ReleaseCheck(memoryRedis(), answering(200), now);
    const status = await versionStatus(true, check, '0.13.1');
    expect(status.updateAvailable).toBe(false);
    expect(status.output.at(-1)).toMatchObject({ level: 'ok', text: 'Up to date.' });
  });

  it('asks nothing when the check is off', async () => {
    const fetchFn = answering(200);
    const status = await versionStatus(false, new ReleaseCheck(memoryRedis(), fetchFn), '0.13.0');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(status).toMatchObject({ check: 'off', latest: null, updateAvailable: false });
  });

  it('says when GitHub did not answer', async () => {
    const check = new ReleaseCheck(memoryRedis(), answering(500), now);
    const status = await versionStatus(true, check, '0.13.0');
    expect(status).toMatchObject({ check: 'failed', updateAvailable: false });
  });
});
