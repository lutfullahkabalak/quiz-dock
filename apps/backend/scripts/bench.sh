#!/usr/bin/env bash
# The load benchmark's two runs (docs/dev/load-testing.md), on a built backend:
#
#   scripts/bench.sh series <out>        the sizing series (10 to 1500 players), on this checkout
#   scripts/bench.sh ab <ref> <out> [n]  <ref> (A) against this checkout (B), n rounds
#                                        alternated (A B, B A, …), 300 players on
#                                        1 core then 500 on 2 cores
#
# Run it on an idle machine, first thing after it starts: a warm or busy container
# measures itself, not the code. The backend runs on core 0 (0-1 for two cores),
# the players on the others: 4 cores at least. Each run restarts the backend on an
# empty Redis database. Environment: BENCH_DATABASE_URL (a database of its own:
# the benchmark takes the host seat), BENCH_REDIS_URL (a Redis database of its own,
# flushed before each run), BENCH_ARGS (more load-test options, e.g. --rich).
set -euo pipefail

BACKEND=$(cd "$(dirname "$0")/.." && pwd)
export DATABASE_URL=${BENCH_DATABASE_URL:-postgresql://live:live@localhost:5432/quizdock_load?schema=public}
REDIS=${BENCH_REDIS_URL:-redis://localhost:6379/2}
PORT=3100

# One run: a fresh backend from <dir>, then the players. run <dir> <out> <name> <cores> <player cores> <players> <questions>
run() {
  local dir=$1 out=$2 name=$3 cores=$4 pcores=$5 players=$6 questions=$7
  redis-cli -u "$REDIS" flushdb >/dev/null
  (cd "$dir" && REDIS_URL=$REDIS AUTH_MODE=none PORT=$PORT NODE_ENV=production GAME_READ_DELAY_MS=1000 \
    exec taskset -c "$cores" node dist/main.js >"$out/server-$name.log" 2>&1) &
  local pid=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/health" >/dev/null && break; sleep 0.5; done
  # shellcheck disable=SC2086 # BENCH_ARGS holds several options
  (cd "$BACKEND" && taskset -c "$pcores" node scripts/load-test.mjs --url "http://localhost:$PORT" \
    --players "$players" --questions "$questions" --server-pid "$pid" --redis "$REDIS" \
    --out "$out/$name.json" ${BENCH_ARGS:-} >"$out/client-$name.log" 2>&1) || echo "run $name failed, see $out/client-$name.log"
  # Redis's peak since it started: it cannot be reset, so it only grows from one run to the next.
  redis-cli -u "$REDIS" info memory | grep used_memory_peak_human >"$out/redis-$name.txt"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  sleep 2
}

# The machine, next to the results: the figures only mean something with it.
machine() {
  { date -u +%FT%TZ; git -C "$BACKEND" rev-parse HEAD; nproc; grep -m1 'model name' /proc/cpuinfo; node --version; } >"$1/machine.txt"
}

case ${1:-} in
  series)
    out=$(realpath -m "${2:?out dir}"); mkdir -p "$out"; machine "$out"
    (cd "$BACKEND" && npx nest build >/dev/null)
    run "$BACKEND" "$out" one-small 0 1-3 10,50,100,200,300 10
    run "$BACKEND" "$out" one-large 0 1-3 400,500,700 5
    run "$BACKEND" "$out" two 0,1 2-3 300,500,700 5
    run "$BACKEND" "$out" one-xl 0 1-3 1000,1500 5
    ;;
  ab)
    ref=${2:?ref}; out=$(realpath -m "${3:?out dir}"); rounds=${4:-3}; mkdir -p "$out"; machine "$out"
    # A shares this checkout's node_modules (Prisma client, contracts): same schema and contracts only.
    if ! git -C "$BACKEND" diff --quiet "$ref" HEAD -- ../../packages prisma; then
      echo "$ref differs from HEAD in packages/ or prisma/: A would run on B's client and contracts" >&2
      exit 1
    fi
    A=$out/A
    rm -rf "$A"; git -C "$BACKEND" worktree prune
    git -C "$BACKEND" worktree add -q --detach "$A" "$ref"
    ln -s "$BACKEND/../../node_modules" "$A/node_modules"
    ln -s "$BACKEND/node_modules" "$A/apps/backend/node_modules"
    (cd "$A/apps/backend" && npx nest build >/dev/null)
    (cd "$BACKEND" && npx nest build >/dev/null)
    both() { # <variant> <dir> <round>
      run "$2" "$out" "$1-one300-$3" 0 1-3 300 5
      run "$2" "$out" "$1-two500-$3" 0,1 2-3 500 5
    }
    for r in $(seq 1 "$rounds"); do
      if ((r % 2)); then both A "$A/apps/backend" "$r"; both B "$BACKEND" "$r"
      else both B "$BACKEND" "$r"; both A "$A/apps/backend" "$r"; fi
    done
    git -C "$BACKEND" worktree remove --force "$A"
    ;;
  *)
    awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
    exit 1
    ;;
esac
echo "done: $out"
