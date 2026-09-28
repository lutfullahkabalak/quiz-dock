import { gameKeys } from './game.keys';
import { GameService } from './game.service';
import type { PlayerRecord } from './game.types';
import type { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Changes to a player's record made at the same time must all stick: a
 * disconnect during an avatar change, a disconnect racing a ban. Redis is
 * slowed down so that two operations interleave, as they can under load.
 */
describe('GameService: concurrent changes to a player', () => {
  let redis: RedisService;
  let game: GameService;
  const pin = String(800000 + Math.floor(Math.random() * 99999));
  const gameId = 'f'.repeat(32);

  /** The same Redis, every single command 0 to 8 ms late (pipelines untouched). */
  const slowed = (r: RedisService) =>
    new Proxy(r, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof value !== 'function') return value;
        // A pipeline runs on the real client: MULTI … EXEC must stay in one block.
        if (prop === 'multi') return (value as () => unknown).bind(target);
        return async (...args: unknown[]) => {
          await new Promise((res) => setTimeout(res, Math.random() * 8));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });

  const record = async () => {
    const raw = await redis.hget(gameKeys.players(pin), 'p1');
    return raw ? (JSON.parse(raw) as PlayerRecord) : null;
  };

  beforeAll(() => {
    if (!process.env.REDIS_URL?.endsWith('/1')) {
      throw new Error('REDIS_URL must point at the test database (see test/jest.global-setup.ts)');
    }
    redis = new RedisService();
    game = new GameService({} as PrismaService, slowed(redis) as unknown as RedisService);
  });

  beforeEach(async () => {
    // A room in its lobby, with one connected player.
    await redis.hset(gameKeys.room(pin), { roomId: 'r', hostUserId: 'h', gameId });
    await redis.hset(gameKeys.game(gameId as never), { state: 'LOBBY', currentIndex: '-1' });
    const p1: PlayerRecord = {
      nickname: 'Ann',
      avatar: 'Ann',
      userId: null,
      connected: true,
      joinedAt: 1_790_000_000_000,
      latencyMs: 12.5,
    };
    await redis.hset(gameKeys.players(pin), 'p1', JSON.stringify(p1));
  });

  afterAll(async () => {
    const keys = [...(await redis.keys(`*${pin}*`)), ...(await redis.keys(`*${gameId}*`))];
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  const reset = (p1: PlayerRecord) => redis.hset(gameKeys.players(pin), 'p1', JSON.stringify(p1));
  const later = (ms: number) => new Promise((res) => setTimeout(res, ms));

  it('keeps both an avatar change and a disconnect made at the same time', async () => {
    const start = (await record())!;
    for (let round = 0; round < 20; round++) {
      await reset({ ...start, avatar: 'Ann', connected: true });
      await Promise.all([
        game.setAvatar(pin, 'p1', `seed-${round}`),
        later(Math.random() * 20).then(() => game.setConnected(pin, 'p1', false)),
      ]);
      expect(await record()).toMatchObject({ avatar: `seed-${round}`, connected: false });
    }
  });

  it('never brings back a player banned while they were disconnecting', async () => {
    const start = (await record())!;
    for (let round = 0; round < 10; round++) {
      await reset(start);
      await Promise.all([
        game.banPlayer(pin, gameId as never, 'p1', 5),
        later(Math.random() * 5).then(() => game.setConnected(pin, 'p1', false)),
      ]);
      expect(await record()).toBeNull();
    }
  });

  it('leaves the rest of the record as it was', async () => {
    await game.setConnected(pin, 'p1', false);
    expect(await record()).toEqual({
      nickname: 'Ann',
      avatar: 'Ann',
      userId: null,
      connected: false,
      joinedAt: 1_790_000_000_000,
      latencyMs: 12.5,
    });
    expect(await game.setConnected(pin, 'nobody', true)).toBeNull();
  });
});
