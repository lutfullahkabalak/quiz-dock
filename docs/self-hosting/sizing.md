# Sizing the VM

> Part of the [self-hosting guides](README.md). How it was measured, and the raw
> figures: [load testing](../dev/load-testing.md).

How many players can play at once on one QuizDock instance, and what the VM needs.
The figures come from the load test: one room, a quiz of single-choice questions
without media, every player answering within 3 s, the whole stack (backend, Postgres,
Redis) on the same machine, an Intel Xeon at 2.1 GHz.

Measured on 2026-09-27, on a machine that had just started (version after commit
`41ba1ac`). The load test and its script are in the repository: the figures can be
measured again on your own hardware.

## The table

| Players at once, in one room | vCPU | RAM | What to expect |
|--:|--:|--:|---|
| up to 300 | 1 | 2 GB | comfortable: the backend uses about a third of a core at the peak of a question |
| up to 700 | 2 | 2 GB | fluid: answers acknowledged within ~20 ms, the backend under 550 MB |
| up to 1500 | 2 | 4 GB | the edge: answers within ~60 ms for most, up to 0.4 s for the slowest 1 %, the backend near 1 GB, Redis near 400 MB |
| over 1500 | | | not measured |

In every case no answer was lost, and the devices of the room received each question
within 40 ms of each other up to 700 players, 80 ms at 1000 to 1500.

## Why more vCPU do not raise the limit

The live engine runs on Node's single JavaScript thread: a room is played on **one
core**. A second vCPU takes Postgres, Redis, the garbage collector and the network,
which is why 2 vCPU are advised past 300 players, but a third or a fourth changes
nothing for one room. A **faster core** does raise it.

Several rooms at the same time share that same core. Until a measure with several
rooms says otherwise, add their players up.

## What the table does not cover

- **Questions with sound or video**: every device fetches the files. The bandwidth
  and the reverse proxy matter more than the CPU there; see
  [audio & video](audio-video.md).
- **A real network**: players on phones over Wi-Fi add their own latency. The spread
  between devices then depends on their connections more than on the server.
- **Very long quizzes**: the table was measured with short questions. A text-heavy
  quiz costs a little more per answer, not enough to change a line of the table.

Memory is not the constraint below 1000 players: the backend holds about 250 MB at
rest and about 500 MB at 700 to 1000 players, Redis under 100 MB up to 700. At 1500
the backend reaches about 0.9 GB and Redis about 400 MB, hence the 4 GB.
