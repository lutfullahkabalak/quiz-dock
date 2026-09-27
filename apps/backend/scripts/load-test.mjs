#!/usr/bin/env node
/**
 * Load test of a live game: one host and N players play a quiz on a running
 * QuizDock (AUTH_MODE=none), through the same Socket.IO events as the screens.
 * See docs/dev/load-testing.md.
 *
 *   node scripts/load-test.mjs --url http://localhost:3000 --players 10,50,100 \
 *     [--questions 10] [--rich] [--server-pid <pid>] [--redis redis://localhost:6379] [--out result.json]
 *
 * `--rich`: questions as long as the editor lets them be (prompt, explanation,
 * answers), for a snapshot the size of a real text-heavy quiz.
 *
 * For each player count it reports, from the players' side: join and answer
 * latencies, answers refused or lost, and how far apart the devices received
 * the same event (the room's sync); from the server's side, when given its pid
 * and its Redis: CPU, memory, and Redis commands per answer.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Redis } from 'ioredis';
import { io } from 'socket.io-client';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    players: { type: 'string', default: '10,50,100,200,300' },
    questions: { type: 'string', default: '10' },
    'answer-window': { type: 'string', default: '3000' }, // players answer within it (ms)
    rich: { type: 'boolean', default: false },
    'server-pid': { type: 'string' },
    redis: { type: 'string' },
    out: { type: 'string' },
  },
});

const URL_BASE = args.url.replace(/\/$/, '');
const HOST = 'loadtest-host';
const COUNTS = args.players.split(',').map(Number);
const QUESTIONS = Number(args.questions);
const ANSWER_WINDOW_MS = Number(args['answer-window']);
const EVENT_TIMEOUT_MS = 30_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** p-th percentile (0..100) of `xs`, rounded to the ms; null when empty. */
function pct(xs, p) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
}
const stats = (xs) => ({
  n: xs.length,
  p50: pct(xs, 50),
  p95: pct(xs, 95),
  p99: pct(xs, 99),
  max: pct(xs, 100),
});

/** The next `name` event on `socket` matching `where`, rejecting after a timeout. */
function once(socket, name, where = () => true, timeoutMs = EVENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`no '${name}' within ${timeoutMs} ms`));
    }, timeoutMs);
    const listener = (payload) => {
      if (!where(payload)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(payload);
    };
    socket.on(name, listener);
  });
}

async function api(method, path, body) {
  const res = await fetch(`${URL_BASE}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-local-user': HOST },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Runs `fn` over `items`, `limit` at a time. */
async function pool(items, limit, fn) {
  const out = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * CPU (% of one core, between two samples) and RSS (MB) of a local process,
 * sampled every 250 ms until stopped. Reads /proc: Linux only.
 */
function sampleProcess(pid) {
  const ticksPerS = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }));
  const read = () => {
    // Fields after the command name: utime and stime are the 12th and 13th.
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const rssKb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1]);
    return { ticks: Number(fields[11]) + Number(fields[12]), at: performance.now(), rssKb };
  };
  const samples = [];
  let last = read();
  const timer = setInterval(() => {
    try {
      const now = read();
      const cpu = ((now.ticks - last.ticks) / ticksPerS / ((now.at - last.at) / 1000)) * 100;
      samples.push({ cpu, rssMb: Math.round(now.rssKb / 1024) });
      last = now;
    } catch {
      // the process is gone: nothing more to sample
    }
  }, 250);
  return () => {
    clearInterval(timer);
    return samples.length
      ? {
          cpuPct: stats(samples.map((s) => s.cpu)),
          rssMb: { start: samples[0].rssMb, max: Math.max(...samples.map((s) => s.rssMb)) },
        }
      : null;
  };
}

/** Total Redis commands processed so far (`INFO stats`). */
async function redisCommands(redis) {
  const info = await redis.info('stats');
  return Number(/total_commands_processed:(\d+)/.exec(info)?.[1] ?? 0);
}

// ── The quiz ────────────────────────────────────────────────────────────────

async function seedQuiz() {
  await api('POST', '/auth/host-seat/claim', {});
  const quiz = await api('POST', '/quizzes', { title: `Load test ${Date.now()}` });
  // Text to fill a field up to `n` characters, when --rich.
  const text = (label, n) =>
    args.rich
      ? `${label} ${'Lorem ipsum dolor sit amet, consectetur. '.repeat(n / 42)}`.slice(0, n)
      : label;
  for (let i = 0; i < QUESTIONS; i++) {
    await api('POST', `/quizzes/${quiz.id}/questions`, {
      type: 'single_choice',
      prompt: text(`Question ${i + 1}`, 1000),
      ...(args.rich ? { answerExplanation: text('Because', 2000) } : {}),
      timeLimitS: 20,
      options: [
        { text: text('A', 200), color: 'red', shape: 'triangle', isCorrect: true },
        { text: text('B', 200), color: 'blue', shape: 'diamond' },
        { text: text('C', 200), color: 'yellow', shape: 'circle' },
        { text: text('D', 200), color: 'green', shape: 'square' },
      ],
    });
  }
  await api('PATCH', `/quizzes/${quiz.id}/status`, { status: 'ready' });
  return quiz.id;
}

// ── One game with N players ─────────────────────────────────────────────────

async function play(quizId, count, redis) {
  const sockets = [];
  const connect = (auth) => {
    const s = io(`${URL_BASE}/game`, { transports: ['websocket'], auth, forceNew: true });
    sockets.push(s);
    return s;
  };
  const errors = [];
  const joinMs = [];
  const ackMs = [];
  const refused = {};
  let lost = 0;
  const startSpread = [];
  const revealSpread = [];

  try {
    const host = connect({ localUser: HOST });
    host.on('error', (e) => errors.push(`host: ${JSON.stringify(e)}`));
    const { pin } = await host.emitWithAck('host:create', { quizId });

    const players = await pool(
      Array.from({ length: count }, (_, i) => i),
      50,
      async (i) => {
        const socket = connect();
        socket.on('error', (e) => errors.push(`p${i}: ${JSON.stringify(e)}`));
        const t = performance.now();
        const ack = await socket.timeout(EVENT_TIMEOUT_MS).emitWithAck('player:join', {
          pin,
          nickname: `p${i}`,
        });
        joinMs.push(performance.now() - t);
        return { socket, playerId: ack.playerId };
      },
    );

    const commandsBefore = redis ? await redisCommands(redis) : 0;
    const t0 = performance.now();

    for (let q = 0; q < QUESTIONS; q++) {
      // Every device receives the question; each player answers in the window.
      const starts = players.map(({ socket }) =>
        once(socket, 'question:start', (p) => p.questionIndex === q).then((p) => ({
          p,
          at: Date.now(),
        })),
      );
      const reveals = players.map(({ socket }) =>
        once(socket, 'question:reveal').then(() => Date.now()),
      );
      host.emit(q === 0 ? 'host:start' : 'host:next', { pin });
      const received = await Promise.all(starts);
      startSpread.push(
        Math.max(...received.map((r) => r.at)) - Math.min(...received.map((r) => r.at)),
      );

      await Promise.all(
        players.map(async ({ socket }, i) => {
          const { p } = received[i];
          const opensIn = Math.max(0, p.startedAt - Date.now());
          await sleep(opensIn + Math.random() * ANSWER_WINDOW_MS);
          const answer = p.options[Math.floor(Math.random() * p.options.length)].id;
          const t = performance.now();
          const ack = once(socket, 'answer:ack', () => true, 10_000);
          socket.emit('player:submit', { pin, questionIndex: q, answer });
          try {
            const a = await ack;
            ackMs.push(performance.now() - t);
            if (!a.accepted) refused[a.reason] = (refused[a.reason] ?? 0) + 1;
          } catch {
            lost++;
          }
        }),
      );
      const revealedAt = await Promise.all(reveals);
      revealSpread.push(Math.max(...revealedAt) - Math.min(...revealedAt));
    }

    host.emit('host:next', { pin }); // the podium
    await once(host, 'game:podium');
    const gameS = (performance.now() - t0) / 1000;
    const commands = redis ? (await redisCommands(redis)) - commandsBefore : null;
    host.emit('host:end', { pin });
    await sleep(200);

    return {
      players: count,
      gameS: Math.round(gameS),
      joinMs: stats(joinMs),
      answerAckMs: stats(ackMs),
      answersRefused: refused,
      answersLost: lost,
      questionStartSpreadMs: stats(startSpread),
      revealSpreadMs: stats(revealSpread),
      redisCommandsPerAnswer: commands === null ? null : Math.round(commands / (count * QUESTIONS)),
      errors: errors.slice(0, 5),
    };
  } finally {
    for (const s of sockets) s.disconnect();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const redis = args.redis ? new Redis(args.redis) : null;
const quizId = await seedQuiz();
const results = [];
for (const count of COUNTS) {
  const stop = args['server-pid'] ? sampleProcess(args['server-pid']) : () => null;
  process.stdout.write(`${count} players… `);
  try {
    const result = await play(quizId, count, redis);
    result.server = stop();
    results.push(result);
    console.log(
      `ack p95 ${result.answerAckMs.p95} ms, start spread p95 ${result.questionStartSpreadMs.p95} ms,` +
        ` lost ${result.answersLost}, server cpu p95 ${result.server?.cpuPct.p95 ?? '?'} %`,
    );
  } catch (err) {
    stop();
    results.push({ players: count, failed: err.message });
    console.log(`FAILED: ${err.message}`);
  }
  await sleep(1_000);
}
await api('DELETE', `/quizzes/${quizId}`).catch(() => undefined);
await redis?.quit();

console.table(
  results.map((r) =>
    r.failed
      ? { players: r.players, failed: r.failed }
      : {
          players: r.players,
          'join p95': r.joinMs.p95,
          'ack p50': r.answerAckMs.p50,
          'ack p95': r.answerAckMs.p95,
          'ack p99': r.answerAckMs.p99,
          lost: r.answersLost,
          refused: Object.values(r.answersRefused).reduce((a, b) => a + b, 0),
          'start spread p95': r.questionStartSpreadMs.p95,
          'reveal spread p95': r.revealSpreadMs.p95,
          'redis cmd/answer': r.redisCommandsPerAnswer,
          'cpu p95 %': r.server?.cpuPct.p95,
          'rss max MB': r.server?.rssMb.max,
        },
  ),
);
if (args.out) writeFileSync(args.out, JSON.stringify(results, null, 2));
process.exit(0);
