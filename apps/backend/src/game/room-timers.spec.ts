import type { Logger } from '@nestjs/common';
import { RoomTimers } from './room-timers';

describe('RoomTimers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const build = () => {
    const log = { error: jest.fn() };
    return { timers: new RoomTimers(log as unknown as Logger), log };
  };

  it('runs a task once its delay is over, a negative delay at once', async () => {
    const { timers } = build();
    const task = jest.fn(async () => undefined);
    timers.arm('reveal', '1', -50, task);
    await jest.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('keeps one timer of a kind per room: arming again replaces it', async () => {
    const { timers } = build();
    const first = jest.fn(async () => undefined);
    const second = jest.fn(async () => undefined);
    timers.arm('autoNext', '1', 100, first);
    timers.arm('autoNext', '1', 100, second);
    timers.arm('autoNext', '2', 100, first); // another room: its own
    await jest.advanceTimersByTimeAsync(100);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('cancels one kind, or every kind of a room', async () => {
    const { timers } = build();
    const task = jest.fn(async () => undefined);
    timers.arm('reveal', '1', 10, task);
    timers.arm('mediaWait', '1', 10, task);
    timers.arm('hostGrace', '1', 10, task);
    timers.arm('hostGrace', '2', 10, task);
    timers.cancel('reveal', '1');
    await jest.advanceTimersByTimeAsync(5);
    timers.cancelAll('1');
    await jest.advanceTimersByTimeAsync(10);
    expect(task).toHaveBeenCalledTimes(1); // room 2's only
  });

  it('logs a failed task instead of throwing', async () => {
    const { timers, log } = build();
    timers.arm('hostWindow', '7', 0, async () => {
      throw new Error('gone');
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(log.error).toHaveBeenCalledWith('hostWindow timer 7: gone');
  });
});
