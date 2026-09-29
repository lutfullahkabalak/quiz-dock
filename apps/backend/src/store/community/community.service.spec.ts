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
      url: 'https://assets.example/ports.zip',
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
    expect(await service.preview(entry.key)).toEqual({
      title: 'Ports',
      items: [{ kind: 'question', text: 'Port?', options: ['A', 'B'] }],
    });
  });
  it('never imports bytes with a wrong checksum', async () => {
    const entry = (await service.list()).entries[0];
    download.mockResolvedValueOnce(Buffer.alloc(archive.length));
    await expect(service.take('host', entry.key)).rejects.toThrow('community.download_failed');
    expect(portable.importBundle).not.toHaveBeenCalled();
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
