import { afterEach, describe, expect, it, vi } from 'vitest';

/** Sockets as socket.io-client would make them: an emitter that knows if it is connected. */
const { made } = vi.hoisted(() => ({ made: [] as FakeSocket[] }));
type Handler = (...args: unknown[]) => void;
class FakeSocket {
  connected = true;
  handlers = new Map<string, Handler[]>();
  emit = vi.fn();
  on(event: string, h: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), h]);
    return this;
  }
  disconnect() {
    this.connected = false;
    for (const h of this.handlers.get('disconnect') ?? []) h('io client disconnect');
    return this;
  }
}
vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new FakeSocket();
    made.push(s);
    return s;
  },
}));

import { connectHost, connectPlayer, disconnectGame } from './game-client';

describe('game client connections (audit F2)', () => {
  afterEach(() => {
    disconnectGame();
    made.length = 0;
    vi.useRealTimers();
  });

  it('closes the previous connection when a new one opens', async () => {
    await connectHost();
    await connectHost(); // the host opens another game from the dashboard
    connectPlayer();
    expect(made.map((s) => s.connected)).toEqual([false, false, true]);
  });

  it('stops pinging the server once a connection is closed on purpose', () => {
    vi.useFakeTimers();
    connectPlayer();
    const [socket] = made;
    disconnectGame();
    socket.emit.mockClear();
    socket.connected = true; // were it still pinging, the ping would go out
    vi.advanceTimersByTime(120_000);
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
