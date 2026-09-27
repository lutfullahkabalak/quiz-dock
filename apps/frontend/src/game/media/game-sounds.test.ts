import { renderHook } from '@testing-library/react';
import type { RoomSoundsPayload } from '@quiz-dock/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake mixer: counts the oscillators each effect starts, records the buffers played.
const { mixer, oscillators, played, track, ducked, levels } = vi.hoisted(() => {
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
    track: [] as string[],
    ducked: [] as boolean[],
    levels: [] as [string, number][],
  };
});

vi.mock('./audio-mixer', () => ({
  TRACK_FADE_S: 0.8,
  getMixer: () => mixer,
  busInput: () => ({}),
  playBuffer: (_b: unknown, bus: string, opts: { loop?: boolean } = {}) => {
    played.push({ bus, loop: opts.loop });
    return () => undefined;
  },
  setBusDucked: (_bus: string, d: boolean) => ducked.push(d),
  loopTrack: () => ({ play: () => track.push('play'), hold: () => track.push('hold') }),
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
  musicMuted: false,
  sfxMuted: false,
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
    track.length = 0;
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

  it('plays the track while players answer, holds it anywhere else, never from the top again', async () => {
    const withTrack = { ...SOUNDS, musicUrl: '/api/v1/media/track' };
    const ownSound = { visual: null, audio: { url: '/a.m4a', durationMs: 60_000 } } as never;
    const { rerender } = renderHook(({ g }) => useGameSounds(withTrack, g, true), {
      // A question whose own sound plays now: no track over it.
      initialProps: { g: game({ media: ownSound, mediaStartAt: Date.now() }) },
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(track).toEqual([]);
    rerender({ g: game({ questionIndex: 1 }) });
    await vi.waitFor(() => expect(track).toEqual(['play']));
    rerender({ g: game({ questionIndex: 1, state: 'REVEAL' }) });
    rerender({ g: game({ questionIndex: 2 }) });
    rerender({ g: game({ questionIndex: 2, paused: true }) });
    rerender({ g: game({ questionIndex: 2 }) });
    // One track, held and played again (it keeps its place): never a new one per question.
    expect(track).toEqual(['play', 'hold', 'play', 'hold', 'play']);
    expect(played).toEqual([]);
  });

  it('comes back once the question’s own sound is over, not while the host holds it', async () => {
    const withTrack = { ...SOUNDS, musicUrl: '/api/v1/media/track-2' };
    const ownSound = { visual: null, audio: { url: '/a.m4a', durationMs: 2000 } } as never;
    const { rerender } = renderHook(({ g }) => useGameSounds(withTrack, g, true), {
      // Held by the host at 0:01: not over, the track stays out.
      initialProps: {
        g: game({
          media: ownSound,
          mediaStartAt: Date.now() - 10_000,
          anchor: { t: 1, at: Date.now(), playing: false },
        }),
      },
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(track).toEqual([]);
    // Played to its end (started 10 s ago, 2 s long): the track comes back.
    rerender({ g: game({ media: ownSound, mediaStartAt: Date.now() - 10_000 }) });
    await vi.waitFor(() => expect(track).toEqual(['play']));
  });
});
