# Load testing a live game

How many players one QuizDock instance holds, what it needs to hold them, and
how the devices of a room stay in step under load. The benchmark is
`apps/backend/scripts/load-test.mjs`; run it again after any change to the live
engine and compare with the results below.

## 1. What it does

One host and N players play a quiz on a running instance, through the same
Socket.IO events as the real screens:

1. It claims the host seat and creates a quiz of `--questions` single-choice
   questions through the REST API (`AUTH_MODE=none`, header `X-Local-User`). No
   database access: it can target any instance in local mode.
2. For each player count, the host opens a room, the players join (50 at a
   time), then the whole quiz is played: each player answers at a random
   instant within `--answer-window` ms after the answers open, the host moves on
   after each reveal, then ends at the podium.
3. It deletes its quiz at the end.

What it reports, per player count:

| Measure | Meaning |
|---|---|
| `join p95` | time for `player:join` to be acknowledged (ms) |
| `ack p50/p95/p99` | time from `player:submit` to its `answer:ack` (ms): what a player feels |
| `lost` / `refused` | answers never acknowledged / refused (must stay 0) |
| `start spread p95` | how far apart the devices received the same `question:start` (ms): the room's sync |
| `reveal spread p95` | the same for `question:reveal` |
| `redis cmd/answer` | Redis commands processed per answer, whole game included |
| `cpu p95 %` | the backend process's CPU, in % of one core, sampled every 250 ms (`--server-pid`, Linux) |
| `rss max MB` | the backend process's resident memory at its peak |

## 2. Running it

```sh
# A dedicated database and Redis database: the benchmark claims the host seat.
createdb quizdock_load
DATABASE_URL=postgresql://…/quizdock_load pnpm --filter @quiz-dock/backend exec prisma migrate deploy
pnpm --filter @quiz-dock/backend build

# The backend, pinned to the cores it may use (here: one).
cd apps/backend
DATABASE_URL=postgresql://…/quizdock_load REDIS_URL=redis://localhost:6379/2 \
AUTH_MODE=none PORT=3100 NODE_ENV=production GAME_READ_DELAY_MS=1000 \
taskset -c 0 node dist/main.js &

# The players, on the other cores.
taskset -c 1-3 pnpm load-test --url http://localhost:3100 --players 10,50,100,200,300 \
  --questions 10 --server-pid <backend pid> --redis redis://localhost:6379/2 --out result.json
```

`GAME_READ_DELAY_MS=1000` only shortens the reading time before each question
(3 s by default) so a run takes less long; it changes nothing to the load.

`--rich` fills each question (prompt, explanation, answers) to the editor's limits:
the quiz's snapshot, which the engine reads on every answer, then weighs what a real
text-heavy quiz does (about 4 KB a question) instead of a few bytes.

`scripts/bench.sh` plays the two runs this page reports, a fresh backend and
Redis database for each, on the database `quizdock_load` and the Redis database 2
of localhost (`BENCH_DATABASE_URL`, `BENCH_REDIS_URL` to change them):

```sh
cd apps/backend
scripts/bench.sh series /tmp/bench/series
scripts/bench.sh ab b6c792e /tmp/bench/ab
```

- `series`: the tables of §3, 10 to 700 players on one core, 300 to 700 on two.
- `ab <ref>`: compares a commit (A) with the checkout (B). Their runs alternate
  (A B, B A, A B) rather than follow each other: a container's CPU varies from one
  minute to the next, and a single run of each can mislead. Both share the
  checkout's `node_modules`: the script refuses a commit whose Prisma schema or
  contracts differ.

**Measure on a machine that just started.** A container that has been running
for hours, or other work on the machine, moves the figures more than most code
changes: the baseline was measured right after the container started, and any
figure compared with it must be too. The script notes the machine and the commit
next to the results (`machine.txt`).

**Do not point it at a production instance**: it takes the host seat and plays
real games there.

## 3. Results

### Baseline — before the engine refactoring (2026-09-27)

Setup: backend, Postgres 16 and Redis 7 in one container, Intel Xeon @ 2.10 GHz,
Node 22, questions without media, 10 questions (5 above 300 players), every
player answering within 3 s. The players ran on the same machine, on other
cores, over the loopback: no network latency is counted.

**Backend pinned to 1 core**

| Players | join p95 | ack p50 | ack p95 | ack p99 | lost | start spread p95 | reveal spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 10 | 154 | 6 | 9 | 17 | 0 | 2 | 1 | 8 % | 265 MB |
| 50 | 372 | 4 | 8 | 9 | 0 | 2 | 3 | 8 % | 294 MB |
| 100 | 464 | 5 | 8 | 12 | 0 | 5 | 6 | 16 % | 303 MB |
| 200 | 403 | 7 | 15 | 37 | 0 | 7 | 14 | 40 % | 340 MB |
| 300 | 723 | 9 | 20 | 37 | 0 | 12 | 20 | 75 % | 359 MB |
| 400 | 743 | 12 | 31 | 57 | 0 | 15 | 19 | 100 % | 419 MB |
| 500 | 857 | 79 | **600** | 664 | 0 | 19 | 36 | 100 % | 520 MB |
| 700 | 1172 | 1506 | **3399** | 3843 | 0 | 35 | 42 | 100 % | 858 MB |

**Backend on 2 cores**

| Players | ack p95 | ack p99 | lost | start spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|
| 300 | 14 | 32 | 0 | 13 | 100 % | 331 MB |
| 500 | 102 | 123 | 0 | 19 | 108 % | 415 MB |
| 700 | **2849** | 3125 | 0 | 22 | 108 % | 889 MB |

Redis: 12 commands per answer, 78 MB at its peak over all the runs.

Raw results: [`load-results/2026-09-27-baseline.json`](load-results/2026-09-27-baseline.json).

### Reading

- **Stable up to 700 players**: no answer lost or refused, no error. Past
  its limit the instance slows down, it does not drop anything.
- **The room stays in step**: the devices receive the same question within
  12 ms of each other at 300 players, 35 ms at 700.
- **The limit is one core.** The engine runs on Node's single JavaScript
  thread: it saturates one core around 400 players, and answers then queue
  (0.6 s at 500, 3.4 s at 700). A second core only takes the garbage collector
  and I/O: it helps at 500 (0.1 s), not beyond. More vCPU do not raise the
  limit; a faster core does.
- **The CPU grows faster than the players** (16 % at 100, 40 % at 200, 75 % at
  300): each answer re-reads every player of the room to count who answered, and
  each reveal looks each player up in the ranking — both quadratic over a
  question. The first target of any optimisation.
- **Memory is not the constraint**: about 265 MB at rest, under 450 MB up to 400
  players.

### After the refactoring lots (2026-09-27, evening)

The same setup and series, on the code after every lot (2, 4a to 4d, perf, 5).
**Indicative**: measured on a container already warm from a day of runs, unlike the
baseline, and before the answer count was coalesced (lot 5b). To be measured again
from a cold start.

**Backend pinned to 1 core**

| Players | join p95 | ack p50 | ack p95 | ack p99 | lost | start spread p95 | reveal spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 10 | 70 | 6 | 13 | 18 | 0 | 1 | 4 | 8 % | 287 MB |
| 50 | 608 | 6 | 10 | 14 | 0 | 2 | 4 | 12 % | 293 MB |
| 100 | 370 | 7 | 13 | 18 | 0 | 8 | 5 | 20 % | 309 MB |
| 200 | 418 | 7 | 13 | 18 | 0 | 9 | 14 | 40 % | 319 MB |
| 300 | 602 | 12 | 44 | 189 | 0 | 12 | 15 | 92 % | 387 MB |
| 400 | 630 | 20 | 51 | 66 | 0 | 17 | 13 | 100 % | 315 MB |
| 500 | 1233 | 141 | **505** | 566 | 0 | 26 | 25 | 100 % | 434 MB |
| 700 | 1267 | 1736 | **3299** | 3677 | 0 | 34 | 30 | 100 % | 872 MB |

**Backend on 2 cores**

| Players | ack p95 | ack p99 | lost | start spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|
| 300 | 22 | 33 | 0 | 15 | 108 % | 297 MB |
| 500 | 427 | 708 | 0 | 18 | 108 % | 384 MB |
| 700 | **3165** | 3286 | 0 | 26 | 108 % | 851 MB |

Redis: 13 commands per answer (17 at 10 players), 90 MB at its peak.

Raw results: [`load-results/2026-09-27-after-lots.json`](load-results/2026-09-27-after-lots.json).

### Sizing

For operators, from these figures: [sizing the VM](../self-hosting/sizing.md).

## 4. Not measured (yet)

- **Media.** Questions with sound or video: the files are fetched by every
  device, the bandwidth and the reverse proxy matter more than the CPU. See
  [audio & video](../self-hosting/audio-video.md).
- **A real network.** Players on phones over Wi-Fi add their own latency; the
  spread between devices then depends on their connection more than on the
  server.
- **Postgres under load.** A game touches it at its creation and at the
  archive only; the archive of a large session is not timed here.
- **Several rooms at once.** One room per run; rooms share the same core.
