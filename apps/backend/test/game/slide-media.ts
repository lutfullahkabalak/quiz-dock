import type { Socket } from 'socket.io-client';
import { MEDIA_LEAD_MS } from '../../src/game/game.keys';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { type GameContext, type GameHarness, nextEvent, settle } from '../game-harness';

interface SlideShow {
  slideIndex: number;
  questionIndex: number;
  audio?: { url: string; size?: string; durationMs: number };
  video?: { url: string; loop: boolean; sound: boolean };
  audioTarget?: string;
  mediaStartAt?: number;
}

/**
 * Media on slides (#125): a slide's video and sound get the question's machinery —
 * fetched ahead, waited for, started on one instant, held by the pause, stretched in
 * auto mode, steered from the console — keyed by the step, never by the question it
 * precedes.
 */
export function slideMediaTests(ctx: GameContext): void {
  let h: GameHarness;
  let prisma: PrismaService;
  const assets: string[] = [];
  beforeAll(() => {
    h = ctx.h;
    prisma = ctx.h.prisma;
  });
  afterAll(async () => {
    await prisma.mediaAsset.deleteMany({ where: { id: { in: assets } } });
  });

  const asset = async (kind: 'audio' | 'video', durationMs: number) => {
    const row = await prisma.mediaAsset.create({
      data: {
        ownerId: h.hostUserId,
        url: `/api/v1/media/slide-${kind}-${Date.now()}-${assets.length}`,
        mime: kind === 'audio' ? 'audio/mp4' : 'video/mp4',
        sizeBytes: 1n,
        kind,
        durationMs,
        peaks: kind === 'audio' ? new Array(200).fill(0.5) : [],
      },
    });
    assets.push(row.id);
    return row;
  };

  /** A one-question quiz with a slide before its question, carrying `media`. */
  const quizWithSlide = async (
    media: Record<string, unknown>,
    quiz: Record<string, unknown> = {},
  ) => {
    const seeded = await h.seedQuiz({ title: 'Slide media test', ...quiz });
    await prisma.slide.create({
      data: {
        quizId: seeded.id,
        beforeQuestionId: seeded.questions[0].id,
        orderIndex: 0,
        blocks: [{ type: 'heading', id: 'h', text: 'Listen', level: 1 }],
        ...media,
      },
    });
    return seeded;
  };

  const open = async (quizId: string) => {
    const host = h.connectHost();
    const pin = await h.createGame(host, quizId);
    return { host, pin };
  };

  const screenOf = async (pin: string): Promise<Socket> => {
    const screen = h.connect();
    await screen.emitWithAck('spectator:join', { pin });
    return screen;
  };

  it('fetches the slide first, waits for the projection, then shows it on a common start', async () => {
    const song = await asset('audio', 2_000);
    const quiz = await quizWithSlide({ audioMediaId: song.id });
    const { host, pin } = await open(quiz.id);
    const screen = h.connect();
    // The lobby fetches the first step: the slide, keyed by its index.
    const preload = nextEvent<{ questionIndex: number; slideIndex?: number; media: unknown }>(
      screen,
      'media:preload',
    );
    const told = nextEvent<{ hasSound: boolean }>(screen, 'game:media');
    await screen.emitWithAck('spectator:join', { pin });
    expect(await told).toMatchObject({ hasSound: true });
    expect(await preload).toMatchObject({
      questionIndex: 0,
      slideIndex: 0,
      media: { audio: { url: song.url } },
    });

    // The projection has not loaded it: the room waits before the slide, as before a question.
    const wait = nextEvent<{ questionIndex: number; slideIndex?: number }>(screen, 'media:wait');
    host.emit('host:start', { pin });
    expect(await wait).toMatchObject({ questionIndex: 0, slideIndex: 0 });

    // Loaded: the slide shows, its sound starting a lead after it, for everyone.
    const shown = nextEvent<SlideShow>(screen, 'slide:show');
    const before = Date.now();
    screen.emit('media:ready', { pin, questionIndex: 0, slideIndex: 0 });
    const slide = await shown;
    expect(slide).toMatchObject({
      slideIndex: 0,
      audio: { url: song.url, size: 'hidden' },
      audioTarget: 'projection_remote',
    });
    expect(slide.mediaStartAt! - before).toBeGreaterThanOrEqual(MEDIA_LEAD_MS - 50);
    expect(slide.mediaStartAt! - Date.now()).toBeLessThanOrEqual(MEDIA_LEAD_MS);
    host.emit('host:end', { pin });
  }, 15_000);

  it('the host steers the slide’s sound, keyed by the slide: the question after it starts clean', async () => {
    const song = await asset('audio', 4_000);
    const quiz = await quizWithSlide({ audioMediaId: song.id });
    const { host, pin } = await open(quiz.id);
    const screen = await screenOf(pin);
    screen.on('media:preload', (p: { questionIndex: number; slideIndex?: number }) =>
      screen.emit('media:ready', { pin, ...p }),
    );
    const shown = nextEvent<SlideShow>(screen, 'slide:show');
    host.emit('host:start', { pin });
    await shown;

    const held = nextEvent(screen, 'media:control');
    host.emit('host:media', { pin, action: 'pause', t: 1.5 });
    expect(await held).toMatchObject({ questionIndex: 0, slideIndex: 0, t: 1.5, playing: false });

    // A screen opening now lands where the host put the slide's sound.
    const late = h.connect();
    const replayed = nextEvent(late, 'media:control');
    await late.emitWithAck('spectator:join', { pin });
    expect(await replayed).toMatchObject({ slideIndex: 0, playing: false });

    // On to the question: its own media know nothing of the slide's anchor.
    const controls: unknown[] = [];
    const again = h.connect();
    again.on('media:control', (c) => controls.push(c));
    const question = nextEvent(screen, 'question:start');
    host.emit('host:next', { pin });
    await question;
    await again.emitWithAck('spectator:join', { pin });
    await settle(200);
    expect(controls).toHaveLength(0);
    host.emit('host:end', { pin });
  }, 15_000);

  it('auto mode: a slide stays until its sound has played, a looped video never holds it', async () => {
    const song = await asset('audio', 2_000);
    const clip = await asset('video', 9_000);
    for (const [media, expected] of [
      // The sound plays 2 s after its lead, then the quiz's pause (1 s): about 4.6 s.
      [{ audioMediaId: song.id }, MEDIA_LEAD_MS + 2_000 + 1_000],
      // A looped, muted video is a decor: the slide's own time (the test default 300 ms).
      [{ videoMediaId: clip.id, videoSound: false }, 300],
    ] as const) {
      const quiz = await quizWithSlide(media, { mediaTailS: 1 });
      const { host, pin } = await open(quiz.id);
      const screen = await screenOf(pin);
      screen.on('media:preload', (p: { questionIndex: number; slideIndex?: number }) =>
        screen.emit('media:ready', { pin, ...p }),
      );
      host.emit('host:mode', { pin, mode: 'auto' });
      await nextEvent(screen, 'game:mode');
      const mode = nextEvent<{ autoNextMs?: number }>(screen, 'game:mode', {
        where: (m) => !!m.autoNextMs,
      });
      host.emit('host:start', { pin });
      const { autoNextMs } = await mode;
      expect(Math.abs(autoNextMs! - expected)).toBeLessThan(300);
      host.emit('host:end', { pin });
    }
  }, 20_000);

  it('the game’s pause holds the slide’s media: their start moves by the pause', async () => {
    const song = await asset('audio', 3_000);
    const quiz = await quizWithSlide({ audioMediaId: song.id });
    const { host, pin } = await open(quiz.id);
    const screen = await screenOf(pin);
    screen.on('media:preload', (p: { questionIndex: number; slideIndex?: number }) =>
      screen.emit('media:ready', { pin, ...p }),
    );
    const shown = nextEvent<SlideShow>(screen, 'slide:show');
    host.emit('host:start', { pin });
    const first = (await shown).mediaStartAt!;
    host.emit('host:pause', { pin, paused: true });
    await settle(500);
    const resumed = nextEvent<SlideShow>(screen, 'slide:show');
    host.emit('host:pause', { pin, paused: false });
    const moved = (await resumed).mediaStartAt!;
    expect(moved - first).toBeGreaterThanOrEqual(450);
    expect(moved - first).toBeLessThan(1_500);
    host.emit('host:end', { pin });
  }, 15_000);

  it('a phone in the room fetches nothing of a slide whose sound is not for it', async () => {
    const song = await asset('audio', 2_000);
    const clip = await asset('video', 2_000);
    const quiz = await quizWithSlide({
      videoMediaId: clip.id,
      videoSound: false,
      audioMediaId: song.id,
    });
    const { host, pin } = await open(quiz.id);
    const phone = h.connect();
    const preloads: unknown[] = [];
    phone.on('media:preload', (p) => preloads.push(p));
    await phone.emitWithAck('player:join', { pin, nickname: 'Rui' });
    await settle(300);
    // Its image and nothing else: the slide has none, so not a word.
    expect(preloads).toHaveLength(0);
    // The slide itself still reaches the phone, with its media for the screens that play them.
    const shown = nextEvent<SlideShow>(phone, 'slide:show');
    host.emit('host:start', { pin });
    expect(await shown).toMatchObject({ video: { loop: true, sound: false } });
    host.emit('host:end', { pin });
  }, 15_000);
}
