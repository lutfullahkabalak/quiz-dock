import type { LatestRelease, VersionStatus } from '@quiz-dock/contracts';
import { appVersion } from '../../common/app-version';
import { RecordingOutput } from '../../cli/output';

/** The latest stable release: GitHub leaves the drafts and pre-releases out. */
export const RELEASES_URL = 'https://api.github.com/repos/quizdock/quiz-dock/releases/latest';
/** GitHub is asked at most once a day… */
export const CHECK_EVERY_S = 24 * 60 * 60;
/** …or an hour after it did not answer. */
export const RETRY_AFTER_S = 60 * 60;
const CACHE_KEY = 'version:latest';
const TIMEOUT_MS = 5_000;
const MAX_ITEMS = 40;

/** Where the answer is kept: Redis. */
export interface ReleaseCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

type Parsed = { core: [number, number, number]; pre: boolean };

function parse(version: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/.exec(version.trim());
  return m ? { core: [+m[1], +m[2], +m[3]], pre: !!m[4] } : null;
}

/** Whether `latest` comes after `current`; never for a `dev` build, which has no version. */
export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  // The same numbers: the release is newer than its own release candidate.
  return !a.pre && b.pre;
}

/**
 * The items of a release's body, by section: *What's Changed* (GitHub's own
 * notes, each without its author and link, the merges of `dev` into `main` left
 * out) and *Upgrading*, as written.
 */
export function releaseItems(body: string): Pick<LatestRelease, 'changes' | 'upgrading'> {
  const changes: string[] = [];
  const upgrading: string[] = [];
  let section = '';
  for (const raw of body.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      continue;
    }
    const item = /^\s*[*-]\s+(.+)$/.exec(raw)?.[1].trim();
    if (!item) continue;
    if (section.startsWith("what's changed")) {
      const text = item.replace(/\s+by @[\w-]+(\[bot\])? in https?:\/\/\S+$/, '').trim();
      if (!/^merge\b/i.test(text) && changes.length < MAX_ITEMS) changes.push(text);
    } else if (section.startsWith('upgrading') && upgrading.length < MAX_ITEMS) {
      upgrading.push(item);
    }
  }
  return { changes, upgrading };
}

/** GitHub's answer as a release, or `null` when it is not a stable one. */
export function readRelease(json: unknown): LatestRelease | null {
  const r = json as Record<string, unknown> | null;
  if (!r || r.draft === true || r.prerelease === true) return null;
  const tag = typeof r.tag_name === 'string' ? r.tag_name : '';
  if (!parse(tag) || parse(tag)!.pre) return null;
  return {
    version: tag.replace(/^v/, ''),
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
    url: typeof r.html_url === 'string' ? r.html_url : '',
    ...releaseItems(typeof r.body === 'string' ? r.body : ''),
  };
}

interface Cached {
  release: LatestRelease | null;
  checkedAt: string;
  failed?: boolean;
}

/**
 * The latest release, read from GitHub at most once a day and kept in Redis,
 * so every page, every `qd` call and every replica share one answer.
 */
export class ReleaseCheck {
  constructor(
    private readonly redis: ReleaseCache,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async latest(current: string): Promise<Cached> {
    const kept = await this.redis.get(CACHE_KEY).catch(() => null);
    if (kept) {
      try {
        return JSON.parse(kept) as Cached;
      } catch {
        // Unreadable: asked again.
      }
    }
    const checkedAt = this.now().toISOString();
    let answer: Cached;
    try {
      const res = await this.fetchFn(RELEASES_URL, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': `QuizDock/${current}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // No release yet is an answer too; any other refusal is a failure.
      if (res.status === 404) answer = { release: null, checkedAt };
      else if (!res.ok) throw new Error(`HTTP ${res.status}`);
      else answer = { release: readRelease(await res.json()), checkedAt };
    } catch {
      answer = { release: null, checkedAt, failed: true };
    }
    await this.redis
      .set(CACHE_KEY, JSON.stringify(answer), 'EX', answer.failed ? RETRY_AFTER_S : CHECK_EVERY_S)
      .catch(() => undefined);
    return answer;
  }
}

/** What `qd version` prints, and the administration reads. */
export async function versionStatus(
  enabled: boolean,
  check: ReleaseCheck,
  current = appVersion(),
): Promise<VersionStatus> {
  const out = new RecordingOutput();
  out.line(`QuizDock ${current}`);
  if (!enabled) {
    out.line('Update check off (UPDATE_CHECK=false).');
    return {
      current,
      check: 'off',
      latest: null,
      updateAvailable: false,
      checkedAt: null,
      output: out.entries,
    };
  }
  const { release, checkedAt, failed } = await check.latest(current);
  const updateAvailable = !!release && isNewer(release.version, current);
  if (failed) out.warn('GitHub did not answer: the latest version is unknown.');
  else if (!release) out.line('Latest stable: none published.');
  else {
    out.line(`Latest stable: ${release.version}`);
    if (updateAvailable) out.warn(`Update available: ./quizdock upgrade ${release.version}`);
    else if (current === 'dev') out.line('A development build: not compared.');
    else out.ok('Up to date.');
  }
  return {
    current,
    check: failed ? 'failed' : 'on',
    latest: release,
    updateAvailable,
    checkedAt,
    output: out.entries,
  };
}
