# Load benchmark results

The raw results of each measure of the live engine, one JSON file per measure: the
code measured, the machine and the time since it started, the resources allocated,
the method, the limits, and every run.

| File | Measure |
|---|---|
| [`2026-09-27-baseline.json`](2026-09-27-baseline.json) | before 0.10.0: one room, 10 to 700 players |
| [`2026-09-27-after-lots.json`](2026-09-27-after-lots.json) | indicative only (a warm machine), superseded |
| [`2026-09-27-cold.json`](2026-09-27-cold.json) | 0.10.0: one room, 10 to 1500 players, and the A/B against the baseline |
| [`2026-09-27-rooms.json`](2026-09-27-rooms.json) | 0.10.0: 1 to 60 rooms of 30 at once, and the one-room series again |

How they were measured, the tables and how to read them:
[load testing](../load-testing.md). For operators: [sizing the VM](../../self-hosting/sizing.md).
To measure again: `apps/backend/scripts/bench.sh`, whose `results.json` is kept here.
