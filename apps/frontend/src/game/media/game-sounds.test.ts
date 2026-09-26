import { renderHook } from '@testing-library/react';
import type { RoomSoundsPayload } from '@quiz-dock/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake mixer: counts the oscillators each effect starts, records the buffers played.
const { mixer, oscillators, played, ducked, levels } = vi.hoisted(() => {
  const oscillators: string[] = [];
  const param = () => ({
    value: 1,
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = () => ({ connect: (n: unknown) => n, gain: param() });
  const ctx = {
    state: 'running',
    currentTime: 0,
    createGain: node,
    createOscillator: () => ({
      ...node(),
      type: '',
      frequency: param(),
      start: () => oscillators.push('osc'),
      stop: () => undefined,
    }),
    decodeAudioData: () => Promise.resolve({ duration: 30 }),
  };
  return {
    mixer: { ctx },
    oscillators,
    played: [] as { bus: string; loop?: boolean }[],
    ducked: [] as boolean[],
    levels: [] as [string, number][],
  };
});

vi.mock('./audio-mixer', () => ({
  getMixer: () => mixer,
  busInput: () => ({}),
  playBuffer: (_b: unknown, bus: string, opts: { loop?: boolean } = {}) => {
    played.push({ bus, loop: opts.loop });
    return () => undefined;
  },
  setBusDucked: (_bus: string, d: boolean) => ducked.push(d),
  setRoomLevel: (bus: string, v: number) => levels.push([bus, v]),
}));

import { useGameSounds } from './game-sounds';

const SOUNDS: RoomSoundsPayload = {
  tick: true,
  gong: true,
  tickUrl: null,
  gongUrl: null,
  musicUrl: null,
  musicLevel: 0.4,
  sfxLevel: 0.7,
};
const game = (over: Partial<Parameters<typeof useGameSounds>[1]> = {}) => ({
  state: 'ANSWERING',
  questionIndex: 0,
  answered: 0,
  paused: false,
  media: { visual: null, audio: null },
  ...over,
});

describe('game sounds (#93)', () => {
  beforeEach(() => {
    oscillators.length = 0;
    played.length = 0;
    ducked.length = 0;
    levels.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new ArrayBuffer(8)))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ticks at each new answer, and strikes the gong when the question ends', () => {
    const { rerender } = renderHook(({ g }) => useGameSounds(SOUNDS, g, true), {
      initialProps: { g: game() },
    });
    expect(levels).toEqual([
      ['music', 0.4],
      ['sfx', 0.7],
    ]);
    rerender({ g: game({ answered: 1 }) });
    expect(oscillators).toHaveLength(1); // the tick
    rerender({ g: game({ answered: 1 }) });
    expect(oscillators).toHaveLength(1); // no new answer, no tick
    rerender({ g: game({ state: 'REVEAL', answered: 1 }) });
    expect(oscillators).toHaveLength(5); // the gong's four partials
    // A new question starting at 0 answers: no tick for the count going back.
    rerender({ g: game({ questionIndex: 1, answered: 0 }) });
    expect(oscillators).toHaveLength(5);
  });

  it('plays nothing on a device that does not play the game’s sounds, nor what is switched off', () => {
    const { rerender } = renderHook(({ g, s, on }) => useGameSounds(s, g, on), {
      initialProps: { g: game(), s: SOUNDS, on: false },
    });
    rerender({ g: game({ answered: 1 }), s: SOUNDS, on: false });
    expect(oscillators).toHaveLength(0);
    const off = { ...SOUNDS, tick: false, gong: false };
    rerender({ g: game({ answered: 1 }), s: off, on: true });
    rerender({ g: game({ answered: 2 }), s: off, on: true });
    rerender({ g: game({ state: 'REVEAL', answered: 2 }), s: off, on: true });
    expect(oscillators).toHaveLength(0);
  });

  it('loops the track while players answer, not over a question with its own sound; a pause ducks it', async () => {
    const withTrack = { ...SOUNDS, musicUrl: '/api/v1/media/track' };
    const { rerender } = renderHook(({ g }) => useGameSounds(withTrack, g, true), {
      initialProps: {
        g: game({ media: { visual: null, audio: { url: '/a.m4a' } } as never }),
      },
    });
    await vi.waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(played).toEqual([]);
    rerender({ g: game({ questionIndex: 1 }) });
    await vi.waitFor(() => expect(played).toEqual([{ bus: 'music', loop: true }]));
    rerender({ g: game({ questionIndex: 1, paused: true }) });
    expect(ducked.at(-1)).toBe(true);
  });
});
