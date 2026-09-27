# Performance roadmap

> **Status: 2026-09-27, after the refactoring lots.** Where the live engine
> spends its time, what was done, and the options to go further, in the order
> they are worth trying. Every step is measured with the [load test](load-testing.md)
> before and after, and must keep the sync tests green
> (`src/game/game.engine.spec.ts`, "sync between devices").

## 1. Where we stand

From the [baseline](load-testing.md#3-results) (one room, questions without
media, Xeon @ 2.10 GHz):

- **Stable up to 700 players**: no answer lost, the devices receive each event
  within 35 ms of each other.
- **Fluid up to ~400 players on one core.** Past that, answers queue: 0.6 s at
  500, 3.4 s at 700.
- **A second core barely helps** (0.1 s at 500, still 2.8 s at 700): the engine
  runs on Node's single JavaScript thread.
- **CPU grows faster than the players**: 16 % of a core at 100, 40 % at 200,
  75 % at 300.

The last point is the lead: the limit comes from the algorithms before it
comes from the hardware.

## 2. Where the time goes

**Measured** with a CPU profile of the backend at 400 players (one core saturated,
`node --cpu-prof`-style sampling through the inspector), after the lots and before 3.0:

| Share of the backend's time | What |
|--:|---|
| ~27 % | sending over the network (`writev`, engine.io, socket.io): mostly `answer:count`, sent to every device on every answer, so 400 × 400 = 160,000 messages a question |
| ~6 % | re-reading and parsing every player on every answer, to count who answered |
| ~4 % | Redis transfers |
| ~3 % | garbage collection |
| ~40 % | idle (the joins, the waits between questions) |

Before that measure, the analysis read the code:

| Moment | What the engine does | Cost |
|---|---|---|
| Each answer (`submit`) | reads the room and the game, parses the **whole quiz snapshot**, then re-reads and parses **every player**, every score and every answer to count who answered | O(N) per answer, **O(N²) per question** |
| Each reveal | for each device, looks its player up in the ranking with a linear search, twice | **O(N²)** |
| Each lobby arrival | recounts who is ready or loaded, and sends the count to every device | O(N) per arrival, **O(N²) to fill a room** |
| Every event | sends it to N devices; the reveal and the podium build one payload per device | O(N), the floor |

## 3. Options, in order

### 3.0 Coalescing `answer:count`: **done** (lot 5b)

- The answer count goes out at most every 100 ms (`ANSWER_COUNT_EVERY_MS`), the last
  one always, instead of on every answer: an answer in a quiet moment goes out at once,
  those within the next 100 ms together at its end. A count still waiting when the
  question is revealed goes out first, so the screens show every answer the reveal
  counts. The count is the same on every device, only its steps are coarser: the room's
  sync is untouched.
- **Audible**: the screens tick once per answer counted, at most 5 ticks per update.
  In a large room (133 answers a second at 400 players) the clatter thins out; in a
  room of 30, answers rarely come within 100 ms of each other and nothing changes.
  The game's sounds are off in a new room anyway: the host turns on the ones they want.
- **Indicative** measure (a warm container, A/B alternated, 2 rounds each, just before
  and after the change): answer ack p95 from 480–503 ms to 12 ms at 500 players on two
  cores, from 23–34 ms to 7–8 ms at 300 players on one; Redis from 13 to 10 commands
  per answer; no answer lost. The reference figures come from the next cold-start run
  (see [load testing](load-testing.md#2-running-it)).

### 3.1 In-memory indexes and a snapshot cache (low risk): **done**

- **Done**: the rank index (lot 2) and the snapshot cache (`GameService`, the last
  50 games). Measured on a text-heavy quiz (`--rich`, 10 questions) at 400 players:
  answer ack p95 from 91–129 ms to 60–75 ms, the start spread from 23–35 ms to
  17–21 ms. The CPU stays saturated: it lightens each answer, it does not move
  the ceiling.

- **Rank index.** Build `playerId → rank` once per reveal or podium, instead
  of a linear search per device. Same result, pure code.
- **Snapshot cache**, keyed by game id. The snapshot is frozen for a game,
  except its form refreshed between steps: the cache is invalidated there. A
  new game of the room has a new id and can never read the previous snapshot.
- Only frozen data is cached in memory. Players, scores and answers change all
  the time: they stay in Redis, the source of truth, so a restart (timers
  re-armed from Redis) and, later, several processes stay correct.

### 3.2 Indexes in Redis (medium risk): **not done**

- The profile gives what they would save, the per-answer parse of every player,
  about 6 % of the time at 400 players (and less since 3.0: the players are counted
  once per count sent, not once per answer). Not worth the drift risk.

- A set of the game's **connected players** and a set of **who answered** each
  question, kept up to date on join, reconnect, disconnect, ban, answer and
  quiz change. Counting becomes `SCARD` / `SINTERCARD` (Redis ≥ 7): one command,
  no parsing on the Node side.
- The risk is these sets drifting from the truth. The convergence tests
  (departures, bans, reconnections, next quiz) cover the cases; each one must
  keep passing.

### 3.3 Coalescing the lobby broadcasts — behaviour change

- Send the "ready / loaded" count at most every ~100 ms instead of on every
  arrival. The count on the screens moves in steps: to be decided as a product
  choice, apart from the rest.

### 3.4 Several processes — architecture

- One Node process per available core (`cluster`, sized from
  `os.availableParallelism()`), each room owned by one process: the Socket.IO
  Redis adapter, sticky sessions at the proxy, and the owner of a room's
  timers (in memory today) to settle.
- It multiplies the **rooms** an instance holds, **not the players of one
  room**: a room's actions must stay in order, or the locks and the sync break.
- Days of work. Worth it only if several large rooms at once on one instance
  become a need. The load test would first get a multi-room mode to decide on
  figures.

### Not planned

- **Worker threads inside a room.** The sockets and the timers live on the main
  thread; moving computation out would add round trips for a small gain, and a
  room's work is sequential anyway.
- **Players or scores cached in memory.** They would drift from Redis on a
  restart and block the multi-process option.

## 4. Order of work

1. ~~The engine refactoring (lot 2), behaviour unchanged, measured.~~ Done.
2. ~~3.1, measured.~~ Done. 3.2 set aside (see above).
3. ~~3.0.~~ Done (lot 5b). 3.3 if the product accepts it.
4. The sizing table published in the [self-hosting guides](../self-hosting/sizing.md),
   from a warm container: to measure again from a cold start, 3.0 included.
5. 3.4 only on a confirmed need, after a multi-room measure.

## 5. Also noted

- Fixed in lot 4a: the reveal settled a `closest` question's points after writing its
  state; the `pg` overlap warning under load.
- **Found while measuring**: the author's media library matched every media against
  every quiz with `LIKE`, 28.6 s for an author with 2,000 quizzes and 200 media. It
  reads the one-pass definition the administration used: 0.25 s (lot 4c).
- **Candidate, not measured**: the archive of a finished game writes one row per
  player, in a transaction (`createManyAndReturn` would take one query). A game's
  end, not its play: to measure before changing.
- Not measured yet: media (bandwidth, the reverse proxy), a real Wi-Fi network,
  several rooms at once, Postgres archiving a large session.
