import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { strFromU8 } from 'fflate';
import { QuizPortableService } from '../../quizzes/portable/quiz-portable.service';
import { publicationMaxBytes } from '../../quizzes/portable/quiz-publication.service';
import { quizBundleSchema, type QuizBundle } from '../../quizzes/portable/quiz-bundle.schema';
import { collectMediaPaths, fromBundle } from '../../quizzes/portable/quiz-bundle';
import { readArchive, archiveLimits } from '../../quizzes/portable/bundle-archive';
import { communityHosts, communityRegistries } from './community-config';
import { allowedUrl, downloadStore } from './safe-download';
import { CommunityCatalogueDto, CommunityPreviewDto, communityEntrySchema } from './community.dto';

const short = z.string().min(1).max(200);
const https = z
  .string()
  .max(2048)
  .url()
  .refine((v) => new URL(v).protocol === 'https:');
const identity = z.object({ host: short, vendor: short });
const registrySchema = z.object({
  format: z.literal('quizdock/registry'),
  version: z.literal(1),
  sources: z.array(identity.extend({ index: https })).max(100),
});
const indexSchema = z.object({
  format: z.literal('quizdock/index'),
  version: z.literal(1),
  source: identity.extend({ homepage: https.optional(), issues: https.optional() }),
  quizzes: z
    .array(
      z.object({
        id: z.string().max(600),
        slug: short.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        url: https,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size: z.number().int().positive(),
        bundleVersion: z.number().int().min(1).max(6),
        title: short,
        description: z.string().max(4000).nullable().optional(),
        language: short,
        tags: z.array(short).max(20),
        license: z.enum(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0']),
        questionCount: z.number().int().min(0).max(500),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(500),
});
type Entry = CommunityCatalogueDto['entries'][number] & { url: string; sha256: string };

@Injectable()
export class CommunityService {
  private snapshot: {
    expires: number;
    catalogue: CommunityCatalogueDto;
    entries: Map<string, Entry>;
  } | null = null;
  private downloads = 0;
  private pending: Promise<CommunityCatalogueDto> | null = null;
  constructor(private readonly portable: QuizPortableService) {}

  async list(): Promise<CommunityCatalogueDto> {
    if (!communityRegistries().length) return { enabled: false, entries: [], unavailable: [] };
    if (this.snapshot && this.snapshot.expires > Date.now()) return this.snapshot.catalogue;
    if (this.pending) return this.pending;
    this.pending = this.load();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
  private async load(): Promise<CommunityCatalogueDto> {
    const entries = new Map<string, Entry>();
    const unavailable: string[] = [];
    const hosts = communityHosts();
    const deadline = Date.now() + 25_000;
    const fetchIndex = (url: string, maxBytes: number) =>
      downloadStore(url, hosts, maxBytes, Math.max(0, deadline - Date.now()));
    for (const registry of communityRegistries()) {
      try {
        const sources = registrySchema.parse(
          JSON.parse((await fetchIndex(registry, 1024 * 1024)).toString('utf8')),
        ).sources;
        const queue = [...sources];
        await Promise.all(
          Array.from({ length: Math.min(4, sources.length) }, async () => {
            let source: (typeof sources)[number] | undefined;
            while ((source = queue.shift())) {
              try {
                const index = indexSchema.parse(
                  JSON.parse((await fetchIndex(source.index, 2 * 1024 * 1024)).toString('utf8')),
                );
                if (index.source.host !== source.host || index.source.vendor !== source.vendor)
                  throw new Error('Source mismatch');
                for (const quiz of index.quizzes) {
                  if (
                    quiz.id !== `${source.host}/${source.vendor}/${quiz.slug}` ||
                    quiz.size > publicationMaxBytes()
                  )
                    continue;
                  allowedUrl(quiz.url, hosts);
                  const key = createHash('sha256')
                    .update(`${registry}\n${source.index}\n${quiz.id}`)
                    .digest('hex');
                  let reportUrl: string | null = null;
                  if (index.source.issues) {
                    const report = new URL(index.source.issues);
                    report.pathname = report.pathname.replace(/\/$/, '') + '/new';
                    report.searchParams.set('title', `Report: ${quiz.id}`);
                    report.searchParams.set(
                      'body',
                      `Quiz: ${quiz.id}\nSource: ${source.index}\nRegistry: ${registry}\nSHA256: ${quiz.sha256}\n\nDescribe the error or takedown request:`,
                    );
                    reportUrl = report.href;
                  }
                  if (entries.size >= 5000) throw new Error('Catalogue limit');
                  entries.set(key, {
                    key,
                    id: quiz.id,
                    title: quiz.title,
                    description: quiz.description ?? null,
                    language: quiz.language,
                    tags: quiz.tags,
                    license: quiz.license,
                    questionCount: quiz.questionCount,
                    author: source.vendor,
                    registry,
                    source: source.index,
                    homepage: index.source.homepage ?? null,
                    reportUrl,
                    updatedAt: quiz.updatedAt,
                    size: quiz.size,
                    url: quiz.url,
                    sha256: quiz.sha256,
                  });
                }
              } catch {
                unavailable.push(source.index);
              }
            }
          }),
        );
      } catch {
        unavailable.push(registry);
      }
    }
    const catalogue = {
      enabled: true,
      entries: [...entries.values()].map((entry) => communityEntrySchema.parse(entry)),
      unavailable,
    };
    this.snapshot = { expires: Date.now() + 60_000, catalogue, entries };
    return catalogue;
  }
  private async loadBundle(key: string): Promise<{ bytes: Buffer; bundle: QuizBundle }> {
    if (!communityRegistries().length) throw new NotFoundException('community.disabled');
    await this.list();
    const entry = this.snapshot?.entries.get(key);
    if (!entry) throw new NotFoundException('store.entry_not_found');
    try {
      const bytes = await downloadStore(
        entry.url,
        communityHosts(),
        Math.min(entry.size, publicationMaxBytes()),
      );
      if (
        bytes.length !== entry.size ||
        createHash('sha256').update(bytes).digest('hex') !== entry.sha256
      )
        throw new Error('Checksum mismatch');
      const files = readArchive(bytes, (n) => n === 'quiz.json' || /^media\/[^/]+$/.test(n), {
        ...archiveLimits(publicationMaxBytes()),
        maxCompressionRatio: 1000,
      });
      if (!files['quiz.json']) throw new Error('No manifest');
      const bundle = quizBundleSchema.parse(JSON.parse(strFromU8(files['quiz.json'])));
      if (
        bundle.quiz.title !== entry.title ||
        bundle.quiz.language !== entry.language ||
        bundle.quiz.license !== entry.license ||
        bundle.items.filter((item) => item.kind === 'question').length !== entry.questionCount
      )
        throw new Error('Index metadata mismatch');
      for (const path of collectMediaPaths(bundle))
        if (!files[path]) throw new Error('Missing media');
      fromBundle(
        bundle,
        () => '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        (p) => (/\.(mp3|m4a)$/i.test(p) ? 'audio' : /\.mp4$/i.test(p) ? 'video' : 'image'),
      );
      return { bytes, bundle };
    } catch {
      throw new BadRequestException('community.download_failed');
    }
  }
  private async download(key: string): Promise<{ bytes: Buffer; bundle: QuizBundle }> {
    if (this.downloads >= 4) throw new HttpException('community.busy', 429);
    this.downloads++;
    try {
      return await this.loadBundle(key);
    } finally {
      this.downloads--;
    }
  }
  async take(ownerId: string, key: string) {
    const { bytes } = await this.download(key);
    return this.portable.importBundle(ownerId, { buffer: bytes, mimetype: 'application/zip' });
  }
  async preview(key: string): Promise<CommunityPreviewDto> {
    const { bundle } = await this.download(key);
    return {
      title: bundle.quiz.title,
      items: bundle.items.map((item) => ({
        kind: item.kind,
        text:
          item.kind === 'question'
            ? (item.prompt ?? '')
            : (item.blocks
                ?.flatMap((b) => {
                  if (!b || typeof b !== 'object') return [];
                  const block = b as Record<string, unknown>;
                  return typeof block.md === 'string'
                    ? [block.md]
                    : typeof block.text === 'string'
                      ? [block.text]
                      : [];
                })
                .join('\n') ?? ''),
        options: item.kind === 'question' ? (item.options?.map((o) => o.text ?? '') ?? []) : [],
      })),
    };
  }
}
