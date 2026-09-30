import { sniffMedia, type SniffResult } from '@quiz-dock/contracts';
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
import { allowedArtifactUrl, sourceBase, downloadStore } from './safe-download';
import { templateSteps } from '../store-preview';
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
type Entry = CommunityCatalogueDto['entries'][number] & { url: string; sha256: string; base: URL };
interface LoadedBundle {
  bytes: Buffer;
  bundle: QuizBundle;
  files: Record<string, Uint8Array>;
  mediaTypes: Map<string, Extract<SniffResult, { ok: true }>>;
}
const BUNDLE_CACHE_MS = 5 * 60_000;
const BUNDLE_CACHE_BYTES = 128 * 1024 * 1024;
const BUNDLE_CACHE_ENTRIES = 4;

@Injectable()
export class CommunityService {
  private snapshot: {
    expires: number;
    catalogue: CommunityCatalogueDto;
    entries: Map<string, Entry>;
  } | null = null;
  private downloads = 0;
  private readonly bundles = new Map<
    string,
    { expires: number; cost: number; value: LoadedBundle }
  >();
  private readonly pendingBundles = new Map<string, Promise<LoadedBundle>>();
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
                  const base = sourceBase(source.index);
                  allowedArtifactUrl(quiz.url, base);
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
                    base,
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
  private async entry(key: string): Promise<Entry> {
    if (!communityRegistries().length) throw new NotFoundException('community.disabled');
    await this.list();
    const entry = this.snapshot?.entries.get(key);
    if (!entry) throw new NotFoundException('store.entry_not_found');
    return entry;
  }
  private async loadBundle(entry: Entry): Promise<LoadedBundle> {
    try {
      const bytes = await downloadStore(
        entry.url,
        communityHosts(),
        Math.min(entry.size, publicationMaxBytes()),
        15_000,
        entry.base,
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
      const mediaTypes: LoadedBundle['mediaTypes'] = new Map();
      for (const path of collectMediaPaths(bundle)) {
        if (!files[path]) throw new Error('Missing media');
        const sniffed = sniffMedia(files[path]);
        if (!sniffed.ok) throw new Error('Unsupported media');
        mediaTypes.set(path, sniffed);
      }
      fromBundle(
        bundle,
        () => '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        (path) => mediaTypes.get(path)?.kind ?? 'image',
      );
      return { bytes, bundle, files, mediaTypes };
    } catch {
      throw new BadRequestException('community.download_failed');
    }
  }
  private async download(entry: Entry): Promise<LoadedBundle> {
    const cacheKey = `${entry.source}\n${entry.url}\n${entry.sha256}\n${entry.size}`;
    const now = Date.now();
    for (const [key, cached] of this.bundles) if (cached.expires <= now) this.bundles.delete(key);
    const cached = this.bundles.get(cacheKey);
    if (cached) {
      this.bundles.delete(cacheKey);
      this.bundles.set(cacheKey, cached);
      return cached.value;
    }
    const pending = this.pendingBundles.get(cacheKey);
    if (pending) return pending;
    if (this.downloads >= 4) throw new HttpException('community.busy', 429);
    this.downloads++;
    const work = this.loadBundle(entry).then((value) => {
      const cost =
        value.bytes.length + Object.values(value.files).reduce((n, b) => n + b.length, 0);
      if (cost > BUNDLE_CACHE_BYTES) throw new BadRequestException('community.download_failed');
      let total = [...this.bundles.values()].reduce((n, b) => n + b.cost, 0);
      while (
        this.bundles.size &&
        (this.bundles.size >= BUNDLE_CACHE_ENTRIES || total + cost > BUNDLE_CACHE_BYTES)
      ) {
        const oldest = this.bundles.keys().next().value!;
        total -= this.bundles.get(oldest)!.cost;
        this.bundles.delete(oldest);
      }
      this.bundles.set(cacheKey, { expires: Date.now() + BUNDLE_CACHE_MS, cost, value });
      return value;
    });
    this.pendingBundles.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.pendingBundles.delete(cacheKey);
      this.downloads--;
    }
  }
  async take(ownerId: string, key: string) {
    const { bytes } = await this.download(await this.entry(key));
    return this.portable.importBundle(ownerId, { buffer: bytes, mimetype: 'application/zip' });
  }
  async preview(key: string): Promise<CommunityPreviewDto> {
    const entry = await this.entry(key);
    const { bundle, mediaTypes } = await this.download(entry);
    const urlOf = (path: string) =>
      mediaTypes.has(path)
        ? `/api/v1/community-store/${key}/media/${encodeURIComponent(path.slice(6))}`
        : null;
    const steps = templateSteps(bundle, key, urlOf);
    return {
      ...communityEntrySchema.parse(entry),
      ...steps,
      coverUrl: bundle.quiz.cover ? urlOf(bundle.quiz.cover) : null,
      slideCount: steps.slides.length,
    };
  }
  async readMedia(key: string, name: string): Promise<{ bytes: Buffer; mime: string }> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name))
      throw new NotFoundException('store.entry_not_found');
    const loaded = await this.download(await this.entry(key));
    const path = `media/${name}`;
    const type = loaded.mediaTypes.get(path);
    if (!type || !loaded.files[path]) throw new NotFoundException('store.entry_not_found');
    return { bytes: Buffer.from(loaded.files[path]), mime: type.mime };
  }
}
