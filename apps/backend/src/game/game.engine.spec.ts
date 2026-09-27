import { randomBytes } from 'node:crypto';
import { OptionColor, OptionShape, QuestionType } from '@quiz-dock/contracts';
import { GameEngine } from './game.engine';
import { type GameId, gameKeys } from './game.keys';
import { GameService } from './game.service';
import {
  DEFAULT_ROOM_SOUNDS,
  type GameMeta,
  type PlayerRecord,
  type PlayerScore,
  type QuizSnapshot,
  ROOM_FIELDS,
  type SnapshotQuestion,
  type SnapshotSlide,
} from './game.types';
import type { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { SessionArchiveService } from './session-archive.service';

/**
 * Characterization of the game engine through its public API only: a real
 * Redis (database 1, see the Jest global setup), a fake Socket.IO server that
 * records what is sent to the room and to each socket. No database: the quiz
 * is never found again, so the frozen snapshot is the one played.
 *
 * The socket integration tests (test/game/*.ts) cover the gateway end to end;
 * this suite pins down the engine's own rules, fast, as a safety net for its
 * refactoring.
 */

type Sent = [event: string, payload: unknown];

class FakeSocket {
  static seq = 0;
  readonly id = `sock${FakeSocket.seq++}`;
  readonly sent: Sent[] = [];
  readonly leave = jest.fn(async () => undefined);
  constructor(
    readonly data: { playerId?: string; isHostControl?: boolean; user?: { id: string } } = {},
  ) {}
  emit(event: string, payload?: unknown): boolean {
    this.sent.push([event, payload]);
    return true;
  }
  /** The payloads of `event` this socket received, oldest first. */
  of<T = unknown>(event: string): T[] {
    return this.sent.filter(([e]) => e === event).map(([, p]) => p as T);
  }
}

const HOST = 'host-1';

let seq = 0;
const option = (isCorrect: boolean) => ({
  id: `o${seq++}`,
  text: isCorrect ? 'right' : 'wrong',
  color: OptionColor.Red,
  shape: OptionShape.Triangle,
  media: null,
  isCorrect,
  correctOrderIndex: null,
});

const question = (over: Partial<SnapshotQuestion> = {}): SnapshotQuestion => ({
  id: `q${seq++}`,
  orderIndex: 0,
  type: QuestionType.SingleChoice,
  prompt: 'Q ?',
  media: { visual: null, audio: null },
  timeLimitS: 20,
  revealDelayS: null,
  answerExplanation: null,
  background: null,
  textTone: 'light',
  textOutline: false,
  basePoints: 1000,
  numericValue: null,
  numericTolerance: null,
  acceptedAnswersNormalized: [],
  options: [option(true), option(false)],
  ...over,
});

const slide = (
  beforeQuestionIndex: number,
  displayDelayS: number | null = null,
): SnapshotSlide => ({
  id: `s${seq++}`,
  beforeQuestionIndex,
  blocks: [],
  background: null,
  textTone: 'light',
  textOutline: false,
  displayDelayS,
});

/** A quiz of `questions` (their `orderIndex` follows their position), with `slides`. */
const snapshotOf = (questions: SnapshotQuestion[], slides: SnapshotSlide[] = []): QuizSnapshot => ({
  quizId: 'quiz-1',
  title: 'Quiz',
  description: null,
  language: 'en',
  feedbackEnabled: true,
  questions: questions.map((q, orderIndex) => ({ ...q, orderIndex })),
  slides,
});

const player = (nickname: string, over: Partial<PlayerRecord> = {}): PlayerRecord => ({
  nickname,
  avatar: nickname,
  userId: null,
  connected: true,
  joinedAt: Date.now(),
  latencyMs: 0,
  ...over,
});

/** A hash as `GameService` writes it: every field a string. */
function toHash(fields: Record<string, unknown>): Record<string, string> {
  const hash: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    hash[key] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  }
  return hash;
}

const isRoomField = (key: string) => (ROOM_FIELDS as readonly string[]).includes(key);

/** Polls `check` until it holds (timers of the engine fire asynchronously). */
async function eventually(check: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('condition never met');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('GameEngine (characterization)', () => {
  let redis: RedisService;
  let game: GameService;
  let archive: { archive: jest.Mock };
  let engine: GameEngine;
  let room: Sent[];
  let sockets: FakeSocket[];
  let pin: string;
  let gameId: GameId;
  const savedEnv = { ...process.env };

  const roomOf = <T = unknown>(event: string): T[] =>
    room.filter(([e]) => e === event).map(([, p]) => p as T);
  const meta = async () => (await game.getMeta(pin))!;
  const state = async () => (await game.getMeta(pin))?.state;
  const scoreOf = async (playerId: string) => (await game.getScore(gameId, playerId))!;

  /**
   * A room playing `snapshot`, with its `players` in the room and in the game.
   * `over` sets fields of the game or of the room, each where it lives.
   */
  async function seed(
    snapshot: QuizSnapshot,
    over: Partial<GameMeta> = {},
    players: Record<string, PlayerRecord> = {},
  ): Promise<void> {
    const fields: Record<string, unknown> = {
      roomId: 'room-1',
      hostUserId: HOST,
      gameId,
      openedAt: Date.now(),
      hostName: 'Host',
      sounds: JSON.stringify(DEFAULT_ROOM_SOUNDS),
      quizId: snapshot.quizId,
      state: 'LOBBY',
      currentIndex: -1,
      totalQuestions: snapshot.questions.length,
      title: snapshot.title,
      language: 'en',
      createdAt: Date.now(),
      mode: 'manual',
      ...over,
    };
    const roomFields = Object.fromEntries(Object.entries(fields).filter(([k]) => isRoomField(k)));
    const gameFields = Object.fromEntries(Object.entries(fields).filter(([k]) => !isRoomField(k)));
    await redis.hset(gameKeys.room(pin), toHash(roomFields));
    await redis.hset(gameKeys.game(gameId), toHash(gameFields));
    await redis.set(gameKeys.snapshot(gameId), JSON.stringify(snapshot));
    const zero: PlayerScore = { score: 0, streak: 0 };
    for (const [id, rec] of Object.entries(players)) {
      await redis.hset(gameKeys.players(pin), id, JSON.stringify(rec));
      await redis.hset(gameKeys.scores(gameId), id, JSON.stringify(zero));
    }
  }

  /** Writes game fields as the engine would find them (a state reached some other way). */
  const setGame = (fields: Record<string, unknown>) =>
    redis.hset(gameKeys.game(gameId), toHash(fields));

  const join = (playerId?: string) => {
    const socket = new FakeSocket(playerId ? { playerId } : {});
    sockets.push(socket);
    return socket;
  };

  /** Starts question 0 of `snapshot`; returns when its answers open. */
  async function startedAt(snapshot: QuizSnapshot, players: Record<string, PlayerRecord>) {
    await seed(snapshot, {}, players);
    await engine.start(pin, HOST);
    return (await meta()).questionStartedAt;
  }

  const rightOption = async (index = 0) =>
    (await game.getSnapshot(gameId))!.questions[index].options[0].id;

  beforeAll(() => {
    if (!process.env.REDIS_URL?.endsWith('/1')) {
      throw new Error('REDIS_URL must point at the test database (see test/jest.global-setup.ts)');
    }
    redis = new RedisService();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(() => {
    process.env.GAME_READ_DELAY_MS = '0';
    process.env.GAME_MEDIA_WAIT_S = '0';
    process.env.GAME_ALL_ANSWERED_DELAY_MS = '0';
    process.env.GAME_AUTO_ADVANCE_MS = '60000';
    pin = String(900000 + Math.floor(Math.random() * 99999));
    gameId = randomBytes(16).toString('hex') as GameId;
    room = [];
    sockets = [];
    game = new GameService(
      { quiz: { findUnique: async () => null } } as unknown as PrismaService,
      redis,
    );
    archive = { archive: jest.fn(async () => undefined) };
    engine = new GameEngine(game, redis, archive as unknown as SessionArchiveService);
    const server = {
      to: () => ({ emit: (event: string, payload: unknown) => room.push([event, payload]) }),
      in: () => ({ fetchSockets: async () => sockets }),
    };
    // bindServer also re-arms timers from Redis: keep it out of these tests.
    (engine as unknown as { server: unknown }).server = server;
  });

  afterEach(async () => {
    // Ends the game: cancels every timer the test armed.
    await engine.end(pin, HOST).catch(() => undefined);
    const keys = [...(await redis.keys(`*${pin}*`)), ...(await redis.keys(`*${gameId}*`))];
    if (keys.length) await redis.del(...keys);
    process.env = { ...savedEnv };
  });

  describe('host guards', () => {
    it('refuses an unknown game and a caller who is not its host', async () => {
      await expect(engine.start(pin, HOST)).rejects.toThrow('session.not_found');
      await seed(snapshotOf([question()]));
      await expect(engine.start(pin, 'someone-else')).rejects.toThrow('host.forbidden');
    });

    it('starts only from the lobby', async () => {
      await seed(snapshotOf([question()]), { state: 'ANSWERING', currentIndex: 0 });
      await expect(engine.start(pin, HOST)).rejects.toThrow('session.already_started');
    });
  });

  describe('lobby settings', () => {
    it('host:capture updates the notice in the lobby, and is locked once started', async () => {
      await seed(snapshotOf([question()]));
      await engine.setCapture(pin, HOST, true);
      expect((await meta()).fullCapture).toBe(true);
      expect(roomOf<{ fullCapture: boolean }>('notice').at(-1)?.fullCapture).toBe(true);

      await engine.start(pin, HOST);
      await expect(engine.setCapture(pin, HOST, false)).rejects.toThrow('session.capture_locked');
    });

    it('host:options writes tracking and name choice, guests only under open access', async () => {
      await seed(snapshotOf([question()]), { personalTracking: true, pickOwnName: true });
      await engine.setOptions(pin, HOST, { personalTracking: false });
      const m = await meta();
      expect([m.personalTracking, m.pickOwnName]).toEqual([false, true]);
      expect(roomOf('notice')).toHaveLength(1);

      await redis.hset(gameKeys.room(pin), { participantAccess: 'open' });
      await expect(engine.setOptions(pin, HOST, { personalTracking: true })).rejects.toThrow(
        'session.open_access_guests_only',
      );
      await expect(engine.setOptions(pin, HOST, { pickOwnName: false })).rejects.toThrow(
        'session.open_access_guests_only',
      );
    });

    it('host:options does nothing without an option, and is locked once started', async () => {
      await seed(snapshotOf([question()]));
      await engine.setOptions(pin, HOST, {});
      expect(roomOf('notice')).toHaveLength(0);
      await engine.start(pin, HOST);
      await expect(engine.setOptions(pin, HOST, { pickOwnName: true })).rejects.toThrow(
        'session.options_locked',
      );
    });

    it('host:lock closes and reopens the game, never an ended one', async () => {
      await seed(snapshotOf([question()]));
      await engine.setJoinLocked(pin, HOST, true);
      expect((await meta()).joinLocked).toBe(true);
      expect(roomOf<{ joinLocked: boolean }>('notice').at(-1)?.joinLocked).toBe(true);
      await setGame({ state: 'ENDED' });
      await expect(engine.setJoinLocked(pin, HOST, false)).rejects.toThrow('session.ended');
    });

    it('host:room-name trims the name in the lobby, and is refused once started', async () => {
      await seed(snapshotOf([question()]));
      await engine.setRoomName(pin, HOST, '  Friday   night ');
      expect((await meta()).roomName).toBe('Friday night');
      expect(roomOf('room:info').at(-1)).toEqual({ name: 'Friday night', hostName: 'Host' });
      await engine.setRoomName(pin, HOST, '   ');
      expect(roomOf('room:info').at(-1)).toEqual({ name: null, hostName: 'Host' });
      await engine.start(pin, HOST);
      await expect(engine.setRoomName(pin, HOST, 'x')).rejects.toThrow('session.already_started');
    });

    it('player:avatar sends the new roster to the room, only in the lobby', async () => {
      await seed(snapshotOf([question()]), {}, { p1: player('Ann') });
      await engine.setAvatar(pin, 'p1', 'seed-42');
      expect(roomOf<{ players: { avatar: string }[] }>('game:roster').at(-1)?.players).toEqual([
        expect.objectContaining({ playerId: 'p1', avatar: 'seed-42', presence: 'room' }),
      ]);
      await engine.start(pin, HOST);
      room.length = 0;
      await engine.setAvatar(pin, 'p1', 'other');
      expect(roomOf('game:roster')).toHaveLength(0);
    });

    it('player:ready is kept per game, in the lobby, for its players only', async () => {
      const ann = join('p1');
      await seed(snapshotOf([question()]), {}, { p1: player('Ann'), p2: player('Bob') });
      expect(await engine.setReady(pin, 'ghost', true)).toBe(false);
      expect(await engine.setReady(pin, 'p1', true)).toBe(true);
      expect(ann.of('lobby:count').at(-1)).toEqual({ ready: 1, total: 2 });
      expect(await engine.setReady(pin, 'p1', false)).toBe(true);
      expect(ann.of('lobby:count').at(-1)).toEqual({ ready: 0, total: 2 });
      await engine.start(pin, HOST);
      expect(await engine.setReady(pin, 'p1', true)).toBe(false);
    });
  });

  describe('sequence', () => {
    it('shows the slide anchored before the first question, then the question', async () => {
      await seed(snapshotOf([question()], [slide(0)]));
      await engine.start(pin, HOST);
      expect(await state()).toBe('SLIDE_SHOW');
      expect(roomOf<{ slideIndex: number }>('slide:show')).toEqual([
        expect.objectContaining({ slideIndex: 0, questionIndex: 0 }),
      ]);

      await engine.next(pin, HOST);
      const m = await meta();
      expect(m.state).toBe('ANSWERING');
      expect(m.questionEndsAt - m.questionStartedAt).toBe(20_000);
      // The allowlist: nothing tells which option is right.
      expect(JSON.stringify(roomOf('question:start')[0])).not.toContain('isCorrect');
    });

    it('host:next needs a reveal or a slide; a double click moves one step only', async () => {
      await startedAt(snapshotOf([question(), question()]), { p1: player('Ann') });
      await expect(engine.next(pin, HOST)).rejects.toThrow('session.reveal_required');

      await engine.reveal(pin, HOST);
      await Promise.all([engine.next(pin, HOST), engine.next(pin, HOST)]);
      const m = await meta();
      expect([m.state, m.currentIndex]).toEqual(['ANSWERING', 1]);
    });

    it('after the last question, the podium: top 3 and each player’s own rank', async () => {
      const ann = join('p1');
      const screen = join();
      const t0 = await startedAt(snapshotOf([question()]), {
        p1: player('Ann'),
        p2: player('Bob'),
      });
      await engine.submit(pin, 'p2', 0, await rightOption(), t0 + 100);
      await engine.submit(pin, 'p1', 0, 'nope', t0 + 100);
      await eventually(async () => (await state()) === 'REVEAL');
      await engine.next(pin, HOST);

      expect(await state()).toBe('PODIUM');
      const podium = ann.of<{ podium: { nickname: string }[]; you: object; quizId: string }>(
        'game:podium',
      )[0];
      expect(podium.podium.map((r) => r.nickname)).toEqual(['Bob', 'Ann']);
      expect(podium.you).toEqual({ score: 0, rank: 2 });
      expect(podium.quizId).toBe('quiz-1');
      expect(screen.of<{ you?: unknown }>('game:podium')[0].you).toBeUndefined();
      expect(ann.of('leaderboard')).toHaveLength(2); // at the reveal, then at the podium
      // The room's standings: this quiz is the first one played.
      expect(ann.of<{ quizzesPlayed: number }>('room:standings')[0].quizzesPlayed).toBe(1);
    });
  });

  describe('answers and reveal', () => {
    it('scores the first answer only, within the window, and reveals once everyone answered', async () => {
      const ann = join('p1');
      const t0 = await startedAt(snapshotOf([question()]), {
        p1: player('Ann'),
        p2: player('Bob'),
      });
      const right = await rightOption();

      const refusal = async (...args: [string, number, string, number]) =>
        (await engine.submit(pin, args[0], args[1], args[2], args[3])).reason;
      expect(await refusal('p1', 0, right, t0 - 1)).toBe('early');
      expect(await refusal('p1', 1, right, t0 + 1)).toBe('closed');
      expect(await refusal('p1', 0, right, t0 + 60_000)).toBe('late');
      expect(await refusal('ghost', 0, right, t0 + 1)).toBe('unknown');
      expect((await engine.submit(pin, 'p1', 0, right, t0 + 1)).accepted).toBe(true);
      expect(await refusal('p1', 0, right, t0 + 2)).toBe('duplicate');
      expect(roomOf('answer:count').at(-1)).toEqual({ answered: 1, total: 2 });
      expect(await state()).toBe('ANSWERING');

      await engine.submit(pin, 'p2', 0, 'nope', t0 + 1);
      await eventually(async () => (await state()) === 'REVEAL');
      const reveals = roomOf<{ state: string }>('game:state').filter((s) => s.state === 'REVEAL');
      expect(reveals).toHaveLength(1);
      const reveal = ann.of<{ yourResult: { correct: boolean; points: number; rank: number } }>(
        'question:reveal',
      )[0];
      expect(reveal.yourResult).toMatchObject({ correct: true, rank: 1 });
      expect(reveal.yourResult.points).toBeGreaterThan(900);
      expect((await scoreOf('p1')).streak).toBe(1);
    });

    it('reveals once whoever gets there first (host, then all answered)', async () => {
      const t0 = await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      await Promise.all([engine.reveal(pin, HOST), engine.reveal(pin, HOST)]);
      await engine.submit(pin, 'p1', 0, 'x', t0 + 1);
      const reveals = roomOf<{ state: string }>('game:state').filter((s) => s.state === 'REVEAL');
      expect(reveals).toHaveLength(1);
    });

    it('numeric closest: the points are settled at the reveal, by distance', async () => {
      const ann = join('p1');
      const q = question({
        type: QuestionType.Numeric,
        scoring: 'closest',
        numericValue: 100,
        numericTolerance: 0,
        options: [],
      });
      const t0 = await startedAt(snapshotOf([q]), {
        p1: player('Ann'),
        p2: player('Bob'),
        p3: player('Cid'),
      });
      await engine.submit(pin, 'p1', 0, 100, t0 + 1);
      await engine.submit(pin, 'p2', 0, 90, t0 + 1);
      expect((await scoreOf('p1')).score).toBe(0); // nothing before every answer is in
      await engine.submit(pin, 'p3', 0, 130, t0 + 1);
      await eventually(async () => (await state()) === 'REVEAL');

      expect(await Promise.all(['p1', 'p2', 'p3'].map(scoreOf))).toEqual([
        { score: 1000, streak: 1 },
        { score: 750, streak: 0 },
        { score: 500, streak: 0 },
      ]);
      const reveal = ann.of<{
        closest: { nickname: string; rank: number }[];
        yourResult: object;
      }>('question:reveal')[0];
      expect(reveal.closest.map((r) => [r.nickname, r.rank])).toEqual([
        ['Ann', 1],
        ['Bob', 2],
        ['Cid', 3],
      ]);
      expect(reveal.yourResult).toMatchObject({ correct: true, points: 1000, closestRank: 1 });
    });
  });

  describe('players leaving', () => {
    it('host:ban kicks the player’s sockets and reveals if they were the last one awaited', async () => {
      const bob = join('p2');
      const t0 = await startedAt(snapshotOf([question()]), {
        p1: player('Ann'),
        p2: player('Bob'),
      });
      await engine.submit(pin, 'p1', 0, 'x', t0 + 1);
      await engine.banPlayer(pin, HOST, 'p2', 5);

      expect(bob.of('kicked')).toEqual([{ minutes: 5 }]);
      expect(bob.leave).toHaveBeenCalledWith(pin);
      expect(roomOf('player:left')).toEqual([{ playerId: 'p2', playerCount: 1 }]);
      expect(roomOf('answer:count').at(-1)).toEqual({ answered: 1, total: 1 });
      expect(await state()).toBe('REVEAL');
      expect(await game.getScore(gameId, 'p2')).toBeNull();
    });

    it('host:ban of someone already gone does nothing', async () => {
      await seed(snapshotOf([question()]));
      await engine.banPlayer(pin, HOST, 'ghost', 5);
      expect(room).toHaveLength(0);
    });

    it('a disconnect completes the answers of those still connected', async () => {
      const t0 = await startedAt(snapshotOf([question()]), {
        p1: player('Ann'),
        p2: player('Bob'),
      });
      await engine.submit(pin, 'p1', 0, 'x', t0 + 1);
      await engine.handlePlayerDisconnect(pin, 'p2');
      expect(roomOf('player:left')).toEqual([{ playerId: 'p2', playerCount: 1 }]);
      expect(await state()).toBe('REVEAL');
    });
  });

  describe('chrono', () => {
    it('host:adjust-time moves the end, and reveals when nothing is left', async () => {
      await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      const before = (await meta()).questionEndsAt;
      await engine.adjustTime(pin, HOST, 5);
      expect((await meta()).questionEndsAt).toBe(before + 5_000);
      expect(roomOf<{ endsAt: number }>('question:time').at(-1)?.endsAt).toBe(before + 5_000);

      await engine.adjustTime(pin, HOST, -60);
      expect(await state()).toBe('REVEAL');
      await expect(engine.adjustTime(pin, HOST, 5)).rejects.toThrow('session.timer_not_adjustable');
    });

    it('paused, the frozen remainder is adjusted instead, never below the floor', async () => {
      await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      await engine.setPaused(pin, HOST, true);
      const frozen = (await meta()).pausedRemainingMs!;
      expect(frozen).toBeGreaterThan(19_000);

      await engine.adjustTime(pin, HOST, 10);
      expect((await meta()).pausedRemainingMs).toBe(frozen + 10_000);
      await engine.adjustTime(pin, HOST, -120);
      expect((await meta()).pausedRemainingMs).toBe(1_000);
      expect(roomOf<{ remainingMs: number }>('game:mode').at(-1)?.remainingMs).toBe(1_000);
      expect(await state()).toBe('ANSWERING');
    });

    it('resuming thaws the chrono on the frozen remainder', async () => {
      await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      await engine.setPaused(pin, HOST, true);
      await engine.setPaused(pin, HOST, false);
      const m = await meta();
      expect(m.clockFrozen).toBe(false);
      const time = roomOf<{ startedAt: number; endsAt: number }>('question:time').at(-1)!;
      expect(time.endsAt).toBe(m.questionEndsAt);
      expect(m.questionEndsAt - Date.now()).toBeGreaterThan(18_000);
    });
  });

  describe('auto mode', () => {
    it('arms the next step on a reveal, and manual mode cancels it', async () => {
      await startedAt(snapshotOf([question(), question()]), { p1: player('Ann') });
      await engine.setMode(pin, HOST, 'auto');
      await engine.reveal(pin, HOST);
      const armed = await meta();
      expect(armed.autoNextAt).toBeGreaterThan(Date.now());
      expect(roomOf<{ autoNextAt?: number }>('game:mode').at(-1)?.autoNextAt).toBe(
        armed.autoNextAt,
      );

      await engine.setMode(pin, HOST, 'manual');
      expect(roomOf<{ autoNextAt?: number }>('game:mode').at(-1)?.autoNextAt).toBeUndefined();
    });

    it('moves on alone after the question’s own reveal delay', async () => {
      await startedAt(snapshotOf([question({ revealDelayS: 0.05 }), question()]), {
        p1: player('Ann'),
      });
      await engine.setMode(pin, HOST, 'auto');
      await engine.reveal(pin, HOST);
      await eventually(async () => (await meta()).currentIndex === 1);
    });

    it('a slide with a zero delay waits for the host even in auto mode', async () => {
      await seed(snapshotOf([question()], [slide(0, 0)]), { mode: 'auto' });
      await engine.start(pin, HOST);
      expect((await meta()).autoNextAt).toBe(0);
    });
  });

  describe('looking back', () => {
    /** Question 0 answered right and revealed, then the slide before question 1. */
    async function onSecondSlide() {
      const t0 = await startedAt(snapshotOf([question(), question()], [slide(1)]), {
        p1: player('Ann'),
      });
      await engine.submit(pin, 'p1', 0, await rightOption(), t0 + 1);
      await eventually(async () => (await state()) === 'REVEAL');
      await engine.next(pin, HOST);
    }

    it('is refused mid-question, and for a step not played yet', async () => {
      await startedAt(snapshotOf([question(), question()]), { p1: player('Ann') });
      await expect(engine.review(pin, HOST, { questionIndex: 0 })).rejects.toThrow(
        'session.review_unavailable',
      );
      await engine.reveal(pin, HOST);
      await expect(engine.review(pin, HOST, { questionIndex: 1 })).rejects.toThrow(
        'session.step_not_played',
      );
    });

    it('shows a played question again on every screen, host:next goes back live', async () => {
      await onSecondSlide();
      const ann = join('p1');
      await engine.review(pin, HOST, { questionIndex: 0 });

      expect((await meta()).reviewStep).toBe('q0');
      expect(ann.of<{ questionIndex: number }>('question:start')[0].questionIndex).toBe(0);
      const reveal = ann.of<{ yourResult: { correct: boolean } }>('question:reveal')[0];
      expect(reveal.yourResult.correct).toBe(true);
      expect(ann.of<{ nav: { review: boolean } }>('game:state')[0].nav.review).toBe(true);

      await engine.next(pin, HOST);
      const m = await meta();
      expect([m.reviewStep, m.state]).toEqual(['', 'SLIDE_SHOW']);
      expect(ann.of('slide:show')).toHaveLength(1); // the live slide, sent again
    });

    it('reviewing a slide shows it; reviewing the live step resumes', async () => {
      await onSecondSlide();
      await engine.next(pin, HOST); // question 1
      await engine.reveal(pin, HOST);
      const screen = join();
      await engine.review(pin, HOST, { slideIndex: 0 });
      expect(screen.of<{ slideIndex: number }>('slide:show')).toEqual([
        expect.objectContaining({ slideIndex: 0, questionIndex: 1 }),
      ]);

      await engine.review(pin, HOST, { questionIndex: 1 });
      expect((await meta()).reviewStep).toBe('');
    });
  });

  describe('state sent to a (re)attached screen', () => {
    it('at a reveal: the question first, then the personal result and the leaderboard', async () => {
      const t0 = await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      await engine.submit(pin, 'p1', 0, 'x', t0 + 1);
      await eventually(async () => (await state()) === 'REVEAL');
      const back = new FakeSocket({ playerId: 'p1' });
      await engine.sendStateTo(back, pin);

      const events = back.sent.map(([e]) => e);
      expect(events.slice(0, 2)).toEqual(['notice', 'room:info']);
      expect(events.slice(-3)).toEqual(['question:start', 'question:reveal', 'leaderboard']);
      expect(back.of<{ yourResult: object }>('question:reveal')[0].yourResult).toMatchObject({
        correct: false,
        rank: 1,
      });
    });

    it('mid-question: the question with its timing and the answer count', async () => {
      await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      const screen = new FakeSocket();
      await engine.sendStateTo(screen, pin);
      expect(screen.of('game:media')).toHaveLength(1);
      expect(screen.of('answer:count')).toEqual([{ answered: 0, total: 1 }]);
      const m = await meta();
      expect(screen.of<{ endsAt: number }>('question:start')[0].endsAt).toBe(m.questionEndsAt);
    });

    it('on a slide, at the podium, while looking back, and during a wait for media', async () => {
      await seed(snapshotOf([question()], [slide(0)]));
      await engine.start(pin, HOST);
      const onSlide = new FakeSocket();
      await engine.sendStateTo(onSlide, pin);
      expect(onSlide.of('slide:show')).toHaveLength(1);

      await setGame({ state: 'PODIUM' });
      const atPodium = new FakeSocket({ playerId: 'p1' });
      await engine.sendStateTo(atPodium, pin);
      expect(atPodium.of('game:podium')).toHaveLength(1);
      expect(atPodium.of('leaderboard')).toHaveLength(1);

      await setGame({ reviewStep: 's0' });
      const reviewing = new FakeSocket();
      await engine.sendStateTo(reviewing, pin);
      expect(reviewing.of('slide:show')).toHaveLength(1);
      expect(reviewing.of('game:podium')).toHaveLength(0);

      await setGame({
        state: 'MEDIA_LOADING',
        reviewStep: '',
        slideIndex: -1,
        mediaWaitUntil: 12345,
      });
      const waiting = new FakeSocket();
      await engine.sendStateTo(waiting, pin);
      expect(waiting.of('media:wait')).toEqual([{ questionIndex: 0, until: 12345 }]);
    });

    it('in the lobby: whether this participant already said they are ready', async () => {
      await seed(snapshotOf([question()]), {}, { p1: player('Ann') });
      await engine.setReady(pin, 'p1', true);
      const back = new FakeSocket({ playerId: 'p1' });
      await engine.sendStateTo(back, pin);
      expect(back.of('lobby:you')).toEqual([{ ready: true }]);
    });
  });

  describe('host away', () => {
    it('back on a slide: the slide is sent again', async () => {
      await seed(snapshotOf([question()], [slide(0)]), {
        state: 'HOST_DISCONNECTED',
        prevState: 'SLIDE_SHOW',
        currentIndex: 0,
        slideIndex: 0,
      });
      await engine.onHostAttached(pin);
      expect(await state()).toBe('SLIDE_SHOW');
      expect(roomOf('slide:show')).toHaveLength(1);
    });

    it('back mid-question: the chrono thaws and the question is sent again', async () => {
      await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      const endsAt = Date.now() + 8_000;
      await setGame({
        state: 'HOST_DISCONNECTED',
        prevState: 'ANSWERING',
        clockFrozen: true,
        pausedRemainingMs: 8000,
      });
      room.length = 0;
      await engine.onHostAttached(pin);
      const m = await meta();
      expect([m.state, m.clockFrozen]).toEqual(['ANSWERING', false]);
      expect(Math.abs(m.questionEndsAt - endsAt)).toBeLessThan(500);
      expect(roomOf('question:start')).toHaveLength(1);
    });
  });

  describe('end', () => {
    it('ends even when the quiz was deleted meanwhile, and says so', async () => {
      await seed(snapshotOf([question()]));
      archive.archive.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: 'P2003' }));
      await engine.end(pin, HOST, true);
      expect(await state()).toBe('ENDED');
      expect(roomOf('error')).toEqual([{ code: 'session.archive_quiz_gone' }]);
      expect(roomOf('game:ended')).toEqual([{ feedbackEnabled: true, quizId: 'quiz-1' }]);
    });

    it('keeps the game when the archive fails otherwise, so the host can retry', async () => {
      await seed(snapshotOf([question()]));
      archive.archive.mockRejectedValueOnce(new Error('db down'));
      await expect(engine.end(pin, HOST, true)).rejects.toThrow('db down');
      expect(await state()).toBe('LOBBY');
    });

    it('ends once: a second host:end neither archives nor broadcasts again', async () => {
      await seed(snapshotOf([question()]));
      await engine.end(pin, HOST, true);
      await engine.end(pin, HOST, true);
      expect(archive.archive).toHaveBeenCalledTimes(1);
      expect(roomOf('game:ended')).toHaveLength(1);
    });
  });

  describe('next quiz in the room', () => {
    const nextQuiz = () => snapshotOf([question({ prompt: 'Next ?' })]);

    it('mid-quiz without archive: the quiz is closed, the players start the next at 0', async () => {
      const t0 = await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      await engine.submit(pin, 'p1', 0, await rightOption(), t0 + 1);
      jest.spyOn(game, 'snapshotFor').mockResolvedValue(nextQuiz());
      const previous = gameId;

      await engine.nextQuiz(pin, HOST, 'quiz-2');
      const m = await meta();
      expect(m.id).not.toBe(previous);
      expect(m.state).toBe('LOBBY');
      expect(await game.getScore(m.id, 'p1')).toEqual({ score: 0, streak: 0 });
      expect(archive.archive).not.toHaveBeenCalled();
      gameId = m.id; // cleaned up with the rest
      await redis.del(...(await redis.keys(`*${previous}*`)));
    });

    it('keeps the quiz as it was when archiving it fails', async () => {
      await startedAt(snapshotOf([question()]), { p1: player('Ann') });
      jest.spyOn(game, 'snapshotFor').mockResolvedValue(nextQuiz());
      archive.archive.mockRejectedValueOnce(new Error('db down'));
      await expect(engine.nextQuiz(pin, HOST, 'quiz-2', true)).rejects.toThrow('db down');
      const m = await meta();
      expect([m.id, m.state]).toEqual([gameId, 'ANSWERING']);
    });

    it('is refused once the room has ended', async () => {
      await seed(snapshotOf([question()]), { state: 'ENDED' });
      await expect(engine.nextQuiz(pin, HOST, 'quiz-2')).rejects.toThrow(
        'session.next_quiz_unavailable',
      );
    });
  });
});
