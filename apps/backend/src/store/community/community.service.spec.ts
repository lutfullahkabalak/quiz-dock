import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { downloadStore } from './safe-download';
import { CommunityService } from './community.service';
import type { QuizPortableService } from '../../quizzes/portable/quiz-portable.service';
jest.mock('./safe-download', () => ({
  ...jest.requireActual('./safe-download'),
  downloadStore: jest.fn(),
}));
const download = jest.mocked(downloadStore);
const registry = 'https://store.example/registry.json';
const source = 'https://author.example/index.json';
const archive = Buffer.from(
  zipSync({
    'quiz.json': strToU8(
      JSON.stringify({
        format: 'quizdock/quiz',
        quiz: { title: 'Ports', language: 'en', license: 'CC0-1.0' },
        items: [
          {
            kind: 'question',
            type: 'single_choice',
            prompt: 'Port?',
            options: [
              { text: 'A', isCorrect: true, color: 'red', shape: 'triangle' },
              { text: 'B', color: 'blue', shape: 'diamond' },
            ],
          },
        ],
      }),
    ),
  }),
);
const index = {
  format: 'quizdock/index',
  version: 1,
  source: {
    host: 'forge.example',
    vendor: 'alice',
    homepage: 'https://author.example',
    issues: 'https://author.example/issues',
  },
  quizzes: [
    {
      id: 'forge.example/alice/ports',
      slug: 'ports',
      url: 'https://author.example/ports.zip',
      sha256: createHash('sha256').update(archive).digest('hex'),
      size: archive.length,
      bundleVersion: 6,
      title: 'Ports',
      language: 'en',
      tags: ['network'],
      license: 'CC0-1.0',
      questionCount: 1,
      updatedAt: '2026-09-29T12:00:00Z',
    },
  ],
};
const json = (v: unknown) => Buffer.from(JSON.stringify(v));
describe('CommunityService', () => {
  const env = process.env;
  let service: CommunityService;
  const portable = { importBundle: jest.fn() };
  beforeEach(() => {
    process.env = {
      ...env,
      QUIZ_STORE_URL: registry,
      QUIZ_STORE_HOSTS: 'author.example,assets.example',
    };
    jest.resetAllMocks();
    service = new CommunityService(portable as unknown as QuizPortableService);
    download.mockImplementation(async (url) => {
      if (url === registry)
        return json({
          format: 'quizdock/registry',
          version: 1,
          sources: [{ host: 'forge.example', vendor: 'alice', index: source }],
        });
      if (url === source) return json(index);
      return archive;
    });
  });
  afterEach(() => {
    process.env = env;
  });
  it('makes no outgoing request when disabled', async () => {
    process.env.QUIZ_STORE_URL = '';
    expect(await service.list()).toEqual({ enabled: false, entries: [], unavailable: [] });
    await expect(service.take('host', 'x')).rejects.toThrow('community.disabled');
    expect(download).not.toHaveBeenCalled();
    expect(portable.importBundle).not.toHaveBeenCalled();
  });
  it('is also disabled when the registry variable is unset', async () => {
    delete process.env.QUIZ_STORE_URL;
    expect(await service.list()).toMatchObject({ enabled: false });
    expect(download).not.toHaveBeenCalled();
  });
  it('refuses a bundle outside the source base even on an allowed host', async () => {
    download.mockImplementation(async (url) =>
      url === registry
        ? json({
            format: 'quizdock/registry',
            version: 1,
            sources: [{ host: 'forge.example', vendor: 'alice', index: source }],
          })
        : json({
            ...index,
            quizzes: [{ ...index.quizzes[0], url: 'https://assets.example/ports.zip' }],
          }),
    );
    expect((await service.list()).entries).toEqual([]);
    expect(portable.importBundle).not.toHaveBeenCalled();
  });
  it('coalesces bundle previews and expires the cached bytes', async () => {
    const entry = (await service.list()).entries[0];
    await Promise.all([
      service.preview(entry.key),
      service.preview(entry.key),
      service.take('host', entry.key),
    ]);
    expect(download).toHaveBeenCalledTimes(3);
    const date = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60_000 + 1);
    try {
      await service.preview(entry.key);
      expect(download).toHaveBeenCalledTimes(6);
    } finally {
      date.mockRestore();
    }
  });
  it('evicts older bundles when the entry count limit is reached', async () => {
    const quizzes = Array.from({ length: 5 }, (_, i) => ({
      ...index.quizzes[0],
      id: `forge.example/alice/ports-${i}`,
      slug: `ports-${i}`,
      url: `https://author.example/ports-${i}.zip`,
    }));
    download.mockImplementation(async (url) =>
      url === registry
        ? json({
            format: 'quizdock/registry',
            version: 1,
            sources: [{ host: 'forge.example', vendor: 'alice', index: source }],
          })
        : url === source
          ? json({ ...index, quizzes })
          : archive,
    );
    const entries = (await service.list()).entries;
    for (const entry of entries) await service.preview(entry.key);
    expect(download).toHaveBeenCalledTimes(7);
    await service.preview(entries[0].key);
    expect(download).toHaveBeenCalledTimes(8);
  });
  it('does not reuse cached bytes when the source checksum changes', async () => {
    const entry = (await service.list()).entries[0];
    await service.preview(entry.key);
    const changed = Buffer.from(
      zipSync({
        'quiz.json': strToU8(
          JSON.stringify({
            format: 'quizdock/quiz',
            quiz: { title: 'Ports', language: 'en', license: 'CC0-1.0' },
            items: [{ kind: 'question', type: 'poll', prompt: 'Updated?', options: [] }],
          }),
        ),
      }),
    );
    download.mockImplementation(async (url) =>
      url === registry
        ? json({
            format: 'quizdock/registry',
            version: 1,
            sources: [{ host: 'forge.example', vendor: 'alice', index: source }],
          })
        : url === source
          ? json({
              ...index,
              quizzes: [
                {
                  ...index.quizzes[0],
                  size: changed.length,
                  sha256: createHash('sha256').update(changed).digest('hex'),
                },
              ],
            })
          : changed,
    );
    const date = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    try {
      expect((await service.preview(entry.key)).questions[0].prompt).toBe('Updated?');
    } finally {
      date.mockRestore();
    }
    expect(download).toHaveBeenCalledTimes(6);
  });
  it('serves only referenced, byte-verified media from the shared preview cache', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jbuUAAAAASUVORK5CYII=',
      'base64',
    );
    const bytes = Buffer.from(
      zipSync({
        'quiz.json': strToU8(
          JSON.stringify({
            format: 'quizdock/quiz',
            quiz: { title: 'Ports', language: 'en', license: 'CC0-1.0', cover: 'media/image.png' },
            items: [
              {
                kind: 'question',
                type: 'single_choice',
                prompt: 'Image?',
                media: 'media/image.png',
                options: [
                  { text: 'A', color: 'red', shape: 'triangle', isCorrect: true },
                  { text: 'B', color: 'blue', shape: 'diamond' },
                ],
              },
            ],
          }),
        ),
        'media/image.png': png,
      }),
    );
    download.mockImplementation(async (url) => {
      if (url === registry)
        return json({
          format: 'quizdock/registry',
          version: 1,
          sources: [{ host: 'forge.example', vendor: 'alice', index: source }],
        });
      if (url === source)
        return json({
          ...index,
          quizzes: [
            {
              ...index.quizzes[0],
              size: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            },
          ],
        });
      return bytes;
    });
    const entry = (await service.list()).entries[0];
    const preview = await service.preview(entry.key);
    expect(Object.values(preview.media)).toEqual([
      `/api/v1/community-store/${entry.key}/media/image.png`,
    ]);
    expect(await service.readMedia(entry.key, 'image.png')).toEqual({
      bytes: png,
      mime: 'image/png',
    });
    await expect(service.readMedia(entry.key, '../quiz.json')).rejects.toThrow(
      'store.entry_not_found',
    );
    await expect(service.readMedia(entry.key, 'absent.png')).rejects.toThrow(
      'store.entry_not_found',
    );
    expect(download).toHaveBeenCalledTimes(3);
  });
  it('lists provenance and a report link, coalesces and caches requests', async () => {
    const [a, b] = await Promise.all([service.list(), service.list()]);
    expect(a).toEqual(b);
    expect(download).toHaveBeenCalledTimes(2);
    expect(a.entries[0]).toMatchObject({ author: 'alice', registry, source, license: 'CC0-1.0' });
    expect(a.entries[0].reportUrl).toContain('issues/new?title=');
    expect(a.entries[0]).not.toHaveProperty('url');
    await service.list();
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('checks the checksum then delegates persistence to the existing importer', async () => {
    const entry = (await service.list()).entries[0];
    portable.importBundle.mockResolvedValue({ id: 'copy' });
    expect(await service.take('host', entry.key)).toEqual({ id: 'copy' });
    expect(portable.importBundle).toHaveBeenCalledWith('host', {
      buffer: archive,
      mimetype: 'application/zip',
    });
    expect(await service.preview(entry.key)).toMatchObject({
      title: 'Ports',
      questions: [expect.objectContaining({ prompt: 'Port?' })],
      slides: [],
      invalid: null,
    });
    expect(download).toHaveBeenCalledTimes(3);
  });
  it('never imports bytes with a wrong checksum', async () => {
    const entry = (await service.list()).entries[0];
    download.mockResolvedValueOnce(Buffer.alloc(archive.length));
    await expect(service.take('host', entry.key)).rejects.toThrow('community.download_failed');
    expect(portable.importBundle).not.toHaveBeenCalled();
    await service.take('host', entry.key);
    expect(portable.importBundle).toHaveBeenCalledTimes(1);
  });
  it('isolates an unavailable source and leaves the internal catalogue independent', async () => {
    download.mockImplementation(async (url) =>
      url === registry
        ? json({
            format: 'quizdock/registry',
            version: 1,
            sources: [{ host: 'forge.example', vendor: 'alice', index: source }],
          })
        : json({ invalid: true }),
    );
    expect(await service.list()).toEqual({ enabled: true, entries: [], unavailable: [source] });
  });
  it('rejects arbitrary import keys without downloading an artifact', async () => {
    await expect(service.take('host', 'arbitrary-url')).rejects.toThrow('store.entry_not_found');
    expect(download).toHaveBeenCalledTimes(2);
  });
});
