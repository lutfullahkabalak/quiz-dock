# Sizing the VM

> Part of the [self-hosting guides](README.md). How it was measured, and the raw
> figures: [load testing](../dev/load-testing.md).

How many players can play at once on one QuizDock instance, and what the VM needs.
The figures come from the load test: one room, a quiz of single-choice questions
without media, every player answering within 3 s, the whole stack (backend, Postgres,
Redis) on the same machine, an Intel Xeon at 2.1 GHz.

> [!NOTE]
> **Provisional (2026-09-27).** Measured on a machine already busy for hours, before
> the last performance change (the answer count sent at most every 100 ms). To be
> measured again on a machine that just started, that change included.

## The table

| Players at once, in one room | vCPU | RAM | What to expect |
|--:|--:|--:|---|
| up to 100 | 1 | 2 GB | wide margin: the backend uses a fifth of a core at the peak of a question |
| up to 300 | 2 | 2 GB | fluid: answers acknowledged within ~50 ms, one core busy during the answers |
| up to 400 | 2 | 4 GB | at the limit: one core saturated while the room answers, still fluid (~50 ms) |
| over 400 | | | not advised in one room: past 400 to 500 players, answers queue (0.5 s at 500, 3 s at 700) whatever the number of vCPU |

In every case no answer was lost, and the devices of the room received each question
within a few tens of milliseconds of each other (35 ms at 700 players).

## Why more vCPU do not raise the limit

The live engine runs on Node's single JavaScript thread: a room is played on **one
core**. A second vCPU takes Postgres, Redis, the garbage collector and the network,
which is why 2 vCPU are advised past 100 players, but a third or a fourth changes
nothing for one room. A **faster core** does raise it.

Several rooms at the same time share that same core: add their players up.

## What the table does not cover

- **Questions with sound or video**: every device fetches the files. The bandwidth
  and the reverse proxy matter more than the CPU there; see
  [audio & video](audio-video.md).
- **A real network**: players on phones over Wi-Fi add their own latency. The spread
  between devices then depends on their connections more than on the server.
- **Very long quizzes**: the table was measured with short questions. A text-heavy
  quiz costs a little more per answer, not enough to change a line of the table.

Memory is not the constraint: the backend holds about 300 MB at rest and under
450 MB up to 500 players; Redis stays under 100 MB.
