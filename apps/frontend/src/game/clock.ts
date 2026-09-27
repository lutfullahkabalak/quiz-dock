import type { GameSocket } from './game-client';

/**
 * The server's clock, as this device sees it. Every time the server sends
 * (`startedAt`, `endsAt`, the media start, a deadline) is on its clock; a phone's
 * clock can be seconds off. A ping/pong gives one sample: the server stamped
 * `t1` somewhere between our `t0` and `t3`, so its clock is ahead of ours by
 * `t1 − (t0 + t3) / 2`, within half the round trip. The sample with the
 * shortest round trip wins; a few at connection, then one now and then.
 */
let offset = 0;
let bestRtt = Number.POSITIVE_INFINITY;

/** Now, on the server's clock (ms epoch). */
export function serverNow(): number {
  return Date.now() + offset;
}

/** Folds one ping/pong into the estimate; returns the offset kept. */
export function addClockSample(t0: number, t1: number, t3: number): number {
  const rtt = t3 - t0;
  if (rtt >= 0 && rtt <= bestRtt) {
    bestRtt = rtt;
    offset = Math.round(t1 - (t0 + t3) / 2);
  }
  return offset;
}

/** Forgets the estimate (a new connection may take another route). */
export function resetClock(): void {
  offset = 0;
  bestRtt = Number.POSITIVE_INFINITY;
}

const BURST = 8;
const BURST_GAP_MS = 120;
/** Bursts again once the page has settled: a page still loading answers its pongs late. */
const SETTLED_BURSTS_MS = [2_000, 8_000];
const EVERY_MS = 30_000;

/**
 * Keeps the estimate fresh on a game socket: bursts of pings at each connection
 * and again once the page has settled, then one every half-minute. The best
 * round trip is forgotten at each connection, so a network change is picked
 * up; within one, the shortest round trip seen so far keeps winning.
 */
export function calibrateClock(socket: GameSocket): void {
  const ping = () => socket.connected && socket.emit('ping', { t0: Date.now() });
  socket.on('pong', ({ t0, t1 }) => addClockSample(t0, t1, Date.now()));
  const burst = () => {
    for (let i = 0; i < BURST; i++) window.setTimeout(ping, i * BURST_GAP_MS);
  };
  const onConnect = () => {
    bestRtt = Number.POSITIVE_INFINITY;
    burst();
    for (const at of SETTLED_BURSTS_MS) window.setTimeout(burst, at);
  };
  socket.on('connect', onConnect);
  if (socket.connected) onConnect();
  window.setInterval(ping, EVERY_MS);
}
