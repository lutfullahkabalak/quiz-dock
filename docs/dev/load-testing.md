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

- `series`: the tables of §3, 10 to 1500 players on one core, 300 to 700 on two.
- `rooms`: 1 to 60 rooms of 30 players at once on one core (`load-test.mjs --rooms`):
  every room starts together, the worst case, and the largest step whose answer
  ack p95 stays within 100 ms is reported.
- `ab <ref>`: compares a commit (A) with the checkout (B). Their runs alternate
  (A B, B A, A B) rather than follow each other: a container's CPU varies from one
  minute to the next, and a single run of each can mislead. Both share the
  checkout's `node_modules`: the script refuses a commit whose Prisma schema or
  contracts differ.

**Measure on a machine that just started.** A container that has been running
for hours, or other work on the machine, moves the figures more than most code
changes: the baseline was measured right after the container started, and any
figure compared with it must be too. The script notes the machine and the commit
next to the results (`machine.txt`), and gathers every run with the machine and
the resources allocated in `results.json`, to keep in `load-results/`.

**Do not point it at a production instance**: it takes the host seat and plays
real games there.

## 3. Results

### The four measures of 2026-09-27

The work of that day (lots 2 to 6, see the [audit](audit-2026-09.md#8-état-après-les-lots-2026-09-27))
was measured four times, all on the same kind of machine: a Claude Code cloud
container (Firecracker micro-VM on a shared host), Intel Xeon @ 2.10 GHz, 4 vCPU,
16 GB. Each raw file records its full setup, its code and its caveats.

| # | Measure | Code | Container up for | Status | Raw file |
|--:|---|---|---|---|---|
| 1 | Baseline, before the lots | `b6c792e` (backend code) | 3 to 14 min | reference for "before" | [`baseline`](load-results/2026-09-27-baseline.json) |
| 2 | After the lots up to 5 | `cf3bf96` | about 4 h 50, after a day of work | **indicative only**, superseded by 3 | [`after-lots`](load-results/2026-09-27-after-lots.json) |
| 3 | After every lot, 5b included, and the A/B against 1 | `41ba1ac` | 4 to 28 min | **reference for "after"** | [`cold`](load-results/2026-09-27-cold.json) |
| 4 | Several rooms of 30 at once, then the series again | `b8659ec` (same backend code as 3) | 5 to 20 min | reference for several rooms; a second sample of 3 | [`rooms`](load-results/2026-09-27-rooms.json) |

Differences of method between 1 and 3:

- In 1, the one-core series (10 to 700 players) ran on a single backend process,
  after a 10-player smoke run; in 3, `scripts/bench.sh` starts a new process for
  each part of the series (10–300, 400–700, 1000–1500). A new process starts with
  a cold JIT.
- 3 adds the 1000 and 1500 steps, which 1 did not measure.

A fresh process could also carry less memory from the previous steps. These
effects are small next to the gap measured (3.4 s against 18 ms at 700 players),
and the A/B of 3, which starts both codes the same way, confirms the gap.

Resources allocated, in all four (the container had no CPU quota and no memory
limit):

| Process | vCPU | RAM |
|---|---|---|
| Backend | 1 (core 0) in the one-core runs, 2 (cores 0-1) in the two-core runs, `taskset` | no limit (16 GB visible); its peak RSS is measured |
| Postgres, Redis | not pinned: the 4 vCPU, shared with the others, the backend's core included | no limit; Redis's peak measured, Postgres's not |
| Simulated players | 3 (cores 1-3) or 2 (cores 2-3), `taskset` | no limit |

So "1 core" means the backend's JavaScript on one core, with Postgres and Redis
able to run elsewhere: a whole instance on 1 vCPU was never measured, nor a VM
with a memory limit.

How far to trust them:

- **The before/after comparison rests on the A/B of 3**: both codes alternated on the
  same machine within 8 minutes, three rounds each. Its ranges show the noise of a
  cloud container: the same code (before) gave 120 to 623 ms at 500 players across
  rounds; after, 11 to 12 ms every round.
- **The series are one run per step**: their variance is not measured. Read a step
  as an order of magnitude, a difference of a few milliseconds as noise.
- **The series measured twice** (3 and 4, two containers) agree within a few
  milliseconds up to 1000 players. At 1500 the p99 differs (431 ms, then 52 ms): the
  edge is where the noise shows.
- **What is not simulated**: a network (the players are on the same machine, over the
  loopback), phones, media. The CPU the simulated players use
  is kept apart (other cores), not their share of memory bandwidth.

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

### After the lots, measured cold (2026-09-27, night): the reference

The code after every lot, the answer count coalesced included (lot 5b, `41ba1ac`),
measured minutes after the container started, on the same kind of machine as the
baseline (Xeon @ 2.10 GHz, 4 vCPU). `scripts/bench.sh`, then `ab b6c792e`.

**Setup**

| | |
|---|---|
| Machine | Claude Code cloud container: a Firecracker micro-VM on a shared host, Intel Xeon @ 2.10 GHz, 4 vCPU, 16 GB RAM, kernel 6.18, no CPU or memory limit set |
| When | the container restarted at 22:16 UTC; the A/B from 22:20 to 22:29, the series from 22:29 to 22:38, the 1000/1500 step until 22:44 (run by hand, now part of `bench.sh`; two earlier attempts discarded, one sampling the wrong process, one unable to start its backend) |
| Backend | `nest build`, `node dist/main.js`, Node 22.22.2 (default heap), `NODE_ENV=production`, `AUTH_MODE=none`, `GAME_READ_DELAY_MS=1000`; pinned with `taskset` to core 0 (one core) or 0-1 (two cores); restarted for each run, on an emptied Redis database |
| Postgres | 16.13, Ubuntu defaults (`shared_buffers` 128 MB, 100 connections), on the same machine |
| Redis | 7.0.15, defaults (no `maxmemory`, no AOF, no I/O threads), on the same machine |
| Players | `scripts/load-test.mjs` on the same machine, over the loopback (no network latency), pinned to cores 1-3 (one-core runs) or 2-3 (two-core runs); WebSocket; 50 joins at a time; each answers a random option at a random moment within 3 s |
| Quiz | one room per step; single choice, 4 options, short texts, no media; 10 questions up to 300 players, 5 from 400 up and in the A/B |

**Backend pinned to 1 core**

| Players | join p95 | ack p50 | ack p95 | ack p99 | lost | start spread p95 | reveal spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 10 | 73 | 5 | 12 | 14 | 0 | 1 | 3 | 12 % | 238 MB |
| 50 | 454 | 3 | 6 | 9 | 0 | 5 | 2 | 8 % | 245 MB |
| 100 | 387 | 3 | 6 | 24 | 0 | 5 | 6 | 12 % | 257 MB |
| 200 | 567 | 2 | 5 | 10 | 0 | 7 | 9 | 20 % | 271 MB |
| 300 | 478 | 1 | 7 | 11 | 0 | 12 | 14 | 36 % | 331 MB |
| 400 | 772 | 2 | 10 | 15 | 0 | 14 | 15 | 100 % | 362 MB |
| 500 | 1106 | 2 | 12 | 16 | 0 | 18 | 19 | 100 % | 427 MB |
| 700 | 1544 | 2 | 18 | 25 | 0 | 39 | 30 | 100 % | 510 MB |
| 1000 | 2165 | 2 | 29 | 38 | 0 | 81 | 53 | 103 % | 515 MB |
| 1500 | 3465 | 3 | **61** | **431** | 0 | 60 | 45 | 104 % | 926 MB |

**Backend on 2 cores**

| Players | ack p95 | ack p99 | lost | start spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|
| 300 | 6 | 10 | 0 | 10 | 104 % | 284 MB |
| 500 | 16 | 35 | 0 | 13 | 104 % | 364 MB |
| 700 | 19 | 26 | 0 | 26 | 104 % | 417 MB |

Redis: 10 to 11 commands per answer (19 at 10 players); its peak since it started,
which cannot be reset between runs, reached 80 MB after the series up to 700 and
375 MB after 1000 then 1500 (both games' keys held together, until their TTL).

**A/B against the baseline's code** (`b6c792e`), alternated, three rounds each:

| | ack p50 | ack p95 | ack p99 | start spread p95 | redis cmd/answer |
|---|--:|--:|--:|--:|--:|
| 300 players, 1 core, before | 8–12 | 18–37 | 28–54 | 9–11 | 12 |
| 300 players, 1 core, after | 2 | 7–8 | 11–12 | 11–13 | 11 |
| 500 players, 2 cores, before | 55–219 | 120–623 | 161–693 | 17–34 | 12 |
| 500 players, 2 cores, after | 2 | 11–12 | 16–18 | 17–21 | 10 |

Raw results: [`load-results/2026-09-27-cold.json`](load-results/2026-09-27-cold.json).

**Reading**

- **The ceiling moved from ~400 to ~1500 players in one room.** At 700 players an
  answer is acknowledged in 18 ms (p95) where the baseline took 3.4 s. At 1500 the
  p95 is still 61 ms but the p99 reaches 0.4 s: the edge.
- **The CPU per player fell by half** (36 % of a core at 300 against 75 %). `cpu p95`
  reaches 100 % from 400 players up: it is the busiest 5 % of the run, and the
  answers stay fast meanwhile. Which moment it is (the joins, most likely: a whole
  room arrives within seconds here) is not measured.
- **The room stays in step**: the devices receive a question within 40 ms of each
  other up to 700 players, 60 to 80 ms at 1000 to 1500.
- **A second core no longer changes much**: one core is enough for one room up to
  700 players.
- The spread at 500 players looked wider after the change in the warm A/B; cold, it
  is not (17–21 ms against 17–34).

### Several rooms at once (2026-09-27, night)

Measure 4: rooms of 30 players, all started together, on one core (`scripts/bench.sh
rooms`, same setup as measure 3; one backend process for every step).

| Rooms of 30 | Players | join p95 | ack p50 | ack p95 | ack p99 | lost | start spread p95 | reveal spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 1 | 30 | 236 | 4 | 11 | 12 | 0 | 1 | 2 | 8 % | 252 MB |
| 10 | 300 | 349 | 2 | 7 | 11 | 0 | 1 | 3 | 84 % | 299 MB |
| 20 | 600 | 184 | 2 | 6 | 10 | 0 | 1 | 2 | 84 % | 416 MB |
| 30 | 900 | 397 | 2 | 7 | 12 | 0 | 2 | 1 | 100 % | 536 MB |
| 40 | 1200 | 215 | 2 | 8 | 12 | 0 | 2 | 2 | 99 % | 661 MB |
| 50 | 1500 | 247 | 2 | 9 | 14 | 0 | 2 | 2 | 100 % | 866 MB |
| 60 | 1800 | 136 | 4 | **25** | **105** | 0 | 2 | 1 | 100 % | 962 MB |

The same container then played the one-room series again (the second sample of
measure 3):

| Players, one room | ack p95 | ack p99 | start spread p95 | cpu p95 | rss max |
|--:|--:|--:|--:|--:|--:|
| 300 | 8 | 16 | 12 | 56 % | 368 MB |
| 700 | 17 | 23 | 25 | 100 % | 496 MB |
| 1000 | 26 | 32 | 51 | 101 % | 489 MB |
| 1500 | 41 | 52 | 69 | 104 % | 790 MB |

**Reading**

- **60 rooms of 30 (1800 players) stay within the 100 ms threshold** (p95 25 ms); the
  p99 crosses it (105 ms). The limit is beyond 60 rooms, not measured.
- **Several small rooms cost less than one large room of the same size**: 1500 players
  as 50 rooms, p95 9 ms; as one room, 41 ms (61 ms in measure 3). A room's events go to
  its own devices only: 30 per event instead of 1500.
- **Each room stays in step**: its devices receive a question within 2 ms of each other.
- **Memory grows with the players**: 866 MB at 1500 players in 50 rooms, 790 MB in one
  room. Not a like-for-like comparison: the rooms ran every step on one process, the
  one-room 1500 on a process that had played 1000 only.
- Redis's peak after the rooms read 19 MB, where the one-room runs reached 271 MB:
  not explained, to look into before relying on it.

Raw results: [`load-results/2026-09-27-rooms.json`](load-results/2026-09-27-rooms.json).

### After the refactoring lots (2026-09-27, evening)

The same setup and series, on the code after every lot (2, 4a to 4d, perf, 5).
**Indicative, superseded by the cold measure above**: measured on a container already
warm from a day of runs, and before the answer count was coalesced (lot 5b).

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
- **Several rooms at the same pace as real ones.** `--rooms` starts every room
  together; real rooms start and answer at their own moments.
