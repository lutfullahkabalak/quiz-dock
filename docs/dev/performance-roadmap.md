# Performance roadmap (draft)

> **Status: draft, 2026-09-27.** Where the live engine spends its time today,
> and the options to go further, in the order they are worth trying. Every step
> is measured with the [load test](load-testing.md) before and after, and must
> keep the sync tests green (`src/game/game.engine.spec.ts`, "sync between
> devices").

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

| Moment | What the engine does | Cost |
|---|---|---|
| Each answer (`submit`) | reads the room and the game, parses the **whole quiz snapshot**, then re-reads and parses **every player**, every score and every answer to count who answered | O(N) per answer, **O(N²) per question** |
| Each reveal | for each device, looks its player up in the ranking with a linear search, twice | **O(N²)** |
| Each lobby arrival | recounts who is ready or loaded, and sends the count to every device | O(N) per arrival, **O(N²) to fill a room** |
| Every event | sends it to N devices; the reveal and the podium build one payload per device | O(N), the floor |

## 3. Options, in order

### 3.1 In-memory indexes and a snapshot cache — low risk

- **Rank index.** Build `playerId → rank` once per reveal or podium, instead
  of a linear search per device. Same result, pure code.
- **Snapshot cache**, keyed by game id. The snapshot is frozen for a game,
  except its form refreshed between steps: the cache is invalidated there. A
  new game of the room has a new id and can never read the previous snapshot.
- Only frozen data is cached in memory. Players, scores and answers change all
  the time: they stay in Redis, the source of truth, so a restart (timers
  re-armed from Redis) and, later, several processes stay correct.

### 3.2 Indexes in Redis — medium risk

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

1. The engine refactoring (lot 2), behaviour unchanged, measured.
2. 3.1, measured; then 3.2, measured.
3. 3.3 if the product accepts it.
4. The sizing table measured again and published in the
   [self-hosting guides](../self-hosting/README.md).
5. 3.4 only on a confirmed need, after a multi-room measure.

## 5. Also noted

- The reveal writes its state in Redis **before** settling the points of a
  `closest` question: a screen reattaching in those few milliseconds would get
  unsettled scores. To fix in the engine work.
- The server logs a `pg` deprecation under load ("`client.query()` when the
  client is already executing a query"): concurrent queries on one client, to
  look at before `pg@9`.
- Not measured yet: media (bandwidth, the reverse proxy), a real Wi-Fi network,
  several rooms at once, Postgres archiving a large session.
