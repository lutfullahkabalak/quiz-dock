import { renderHook } from '@testing-library/react';
import type { RoomSoundsPayload } from '@quiz-dock/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake mixer: counts the oscillators each effect starts, records the buffers played.
const { mixer, oscillators, clicks, played, track, ducked, levels } = vi.hoisted(() => {
  const oscillators: string[] = [];
  const clicks: number[] = [];
  const param = () => ({
    value: 1,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = () => ({ connect: (n: unknown) => n, gain: param() });
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    createGain: node,
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createBuffer: (_c: number, size: number) => ({ getChannelData: () => new Float32Array(size) }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start: (at: number) => clicks.push(at),
      stop: () => undefined,
    }),
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
    clicks,
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

import { tickPitch, useGameSounds } from './game-sounds';

const SOUNDS: RoomSoundsPayload = {
  tick: true,
  gong: true,
  countdown: true,
  ding: false, // its own test below: the counts of the others stay theirs
  tickUrl: null,
  gongUrl: null,
  dingUrl: null,
  countdownUrl: null,
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
    clicks.length = 0;
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
    expect(oscillators).toHaveLength(9); // the gong's eight partials
    // A new question starting at 0 answers: no tick for the count going back.
    rerender({ g: game({ questionIndex: 1, answered: 0 }) });
    expect(oscillators).toHaveLength(9);
  });

  it('each answer’s tick a little higher or lower than the last, never twice the same in a row', () => {
    const pitches = Array.from({ length: 20 }, (_, i) => tickPitch(i + 1));
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).not.toBe(pitches[i - 1]);
    for (const p of pitches) expect(Math.abs(p - 1)).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('a tick for every answer, one after the other', () => {
    const { rerender } = renderHook(({ g }) => useGameSounds(SOUNDS, g, true), {
      initialProps: { g: game() },
    });
    for (let n = 1; n <= 5; n++) rerender({ g: game({ answered: n }) });
    expect(oscillators).toHaveLength(5);
    // Three answers counted in one update: three ticks, not one.
    rerender({ g: game({ answered: 8 }) });
    expect(oscillators).toHaveLength(8);
  });

  it('the last answer, which ends the question, still gets its tick before the gong', () => {
    const { rerender } = renderHook(({ g }) => useGameSounds(SOUNDS, g, true), {
      initialProps: { g: game() },
    });
    // A question that ends on its time: the gong alone.
    rerender({ g: game({ state: 'REVEAL' }) });
    const gong = oscillators.length;
    expect(gong).toBeGreaterThan(0);
    oscillators.length = 0;
    // One player: their answer and the reveal arrive together — the tick too.
    rerender({ g: game({ questionIndex: 1 }) });
    rerender({ g: game({ questionIndex: 1, state: 'REVEAL', answered: 1 }) });
    expect(oscillators).toHaveLength(gong + 1);
  });

  it('the countdown: tic… tac… over the last five seconds, no last tac, the gong on zero', () => {
    const endsAt = Date.now() + 5000;
    const { rerender } = renderHook(({ g }) => useGameSounds(SOUNDS, g, true), {
      initialProps: { g: game({ endsAt }) },
    });
    // Nine clicks (ten half-beats, the last tac left out) and the gong scheduled on zero.
    expect(clicks).toHaveLength(9);
    const gong = oscillators.length;
    expect(gong).toBeGreaterThan(0);
    // The time runs out, then the reveal comes: the gong was struck on zero, not again.
    const now = vi.spyOn(Date, 'now').mockReturnValue(endsAt + 400);
    try {
      rerender({ g: game({ endsAt, state: 'REVEAL' }) });
    } finally {
      now.mockRestore();
    }
    expect(oscillators).toHaveLength(gong);
  });

  it('everyone answered before zero: the countdown is called off, the reveal strikes the gong', () => {
    const endsAt = Date.now() + 3000;
    const { rerender } = renderHook(({ g }) => useGameSounds(SOUNDS, g, true), {
      initialProps: { g: game({ endsAt }) },
    });
    const scheduled = oscillators.length;
    rerender({ g: game({ endsAt, state: 'REVEAL' }) });
    // The scheduled gong is called off (before it sounds), a new one struck now.
    expect(oscillators.length).toBe(scheduled * 2);
  });

  it('no countdown when the room switched it off', () => {
    renderHook(() =>
      useGameSounds({ ...SOUNDS, countdown: false }, game({ endsAt: Date.now() + 5000 }), true),
    );
    expect(clicks).toHaveLength(0);
  });

  it('a ding as a question starts, not over a question with its own sound', () => {
    const withDing = { ...SOUNDS, ding: true };
    const { rerender } = renderHook(({ g }) => useGameSounds(withDing, g, true), {
      initialProps: { g: game({ state: 'LOBBY' }) },
    });
    expect(oscillators).toHaveLength(0);
    rerender({ g: game() }); // question 0 starts
    const ding = oscillators.length;
    expect(ding).toBeGreaterThan(0);
    rerender({ g: game({ answered: 1, state: 'REVEAL' }) });
    oscillators.length = 0;
    rerender({
      g: game({ questionIndex: 1, media: { visual: null, audio: { url: '/a.m4a' } } as never }),
    });
    expect(oscillators).toHaveLength(0); // its own sound: no ding over it
  });

  it('never strikes the gong as a question starts (the last question’s end still in the view)', () => {
    // The new question's state arrives before its question:start: the end known is the last one's.
    renderHook(() => useGameSounds(SOUNDS, game({ endsAt: Date.now() - 2000 }), true));
    expect(oscillators).toHaveLength(0);
    expect(clicks).toHaveLength(0);
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

  it('waits for the answers to open: never over the reading of the question', async () => {
    const withTrack = { ...SOUNDS, musicUrl: '/api/v1/media/track-3' };
    const reading = game({ startedAt: Date.now() + 300 });
    renderHook(() => useGameSounds(withTrack, reading, true));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(track).not.toContain('play'); // still reading
    await vi.waitFor(() => expect(track.at(-1)).toBe('play'), { timeout: 2000 });
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
