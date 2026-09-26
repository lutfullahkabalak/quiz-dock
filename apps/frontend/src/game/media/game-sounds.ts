import type { LiveQuestionMedia, RoomSoundsPayload } from '@quiz-dock/contracts';
import { useEffect, useRef } from 'react';
import { busInput, getMixer, playBuffer, setBusDucked, setRoomLevel } from './audio-mixer';

/**
 * The game's sounds (#93, SPECIFICATIONS-MEDIA §9): a tick at each answer, a
 * gong when a question ends, a background track while players answer. The
 * effects are synthesised here unless the room gave a sample; everything plays
 * into the SFX and MUSIC buses, never straight to the speakers.
 */

/** Whether a question plays a sound or a video of its own: the track then steps aside. */
export function questionHasOwnSound(media: LiveQuestionMedia | null | undefined): boolean {
  return !!media?.audio || media?.visual?.kind === 'video';
}

/** A short, dry click: a triangle wave with a fast decay. */
export function synthTick(): void {
  const mixer = getMixer();
  const into = busInput('sfx');
  if (!mixer || !into) return;
  const { ctx } = mixer;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(env).connect(into);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** A gong: a few inharmonic partials struck together, with a long decay. */
export function synthGong(): void {
  const mixer = getMixer();
  const into = busInput('sfx');
  if (!mixer || !into) return;
  const { ctx } = mixer;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  out.connect(into);
  for (const [freq, level] of [
    [98, 1],
    [196.7, 0.5],
    [262.3, 0.35],
    [411.1, 0.2],
  ] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 3);
  }
}

/** Decoded samples and tracks, fetched once per URL. */
const decoded = new Map<string, Promise<AudioBuffer | null>>();

export function loadSound(url: string): Promise<AudioBuffer | null> {
  const cached = decoded.get(url);
  if (cached) return cached;
  const ctx = getMixer()?.ctx;
  const loading = ctx
    ? fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((bytes) => ctx.decodeAudioData(bytes))
        .catch(() => null)
    : Promise.resolve(null);
  decoded.set(url, loading);
  return loading;
}

/** Plays an effect: its sample when the room gave one, else the synthesised one. */
async function playEffect(url: string | null, synth: () => void): Promise<void> {
  if (!url) {
    synth();
    return;
  }
  const buffer = await loadSound(url);
  if (buffer) playBuffer(buffer, 'sfx');
  else synth(); // a sample that does not load: the room still hears something
}

/** What the game's sounds follow of a live view. */
export interface GameSoundsState {
  state: string | null;
  questionIndex: number;
  answered: number;
  paused: boolean;
  media: LiveQuestionMedia | null | undefined;
}

/**
 * The game's sounds on this device, when `audible` (the projection; a remote
 * participant's phone or copy — SPECIFICATIONS-MEDIA §9). Only once the page's
 * audio runs: before its unlocking click, nothing plays.
 */
export function useGameSounds(
  sounds: RoomSoundsPayload | null,
  game: GameSoundsState,
  audible: boolean,
): void {
  const on = audible && !!sounds;
  // The levels of the two buses follow the room's settings.
  useEffect(() => {
    if (!on || !sounds) return;
    setRoomLevel('music', sounds.musicLevel);
    setRoomLevel('sfx', sounds.sfxLevel);
  }, [on, sounds]);

  const last = useRef<{ state: string | null; questionIndex: number; answered: number }>({
    state: null,
    questionIndex: -1,
    answered: 0,
  });
  const running = () => getMixer()?.ctx.state === 'running';

  // The tick and the gong: from the changes of the view, not events of their own.
  useEffect(() => {
    const prev = last.current;
    last.current = {
      state: game.state,
      questionIndex: game.questionIndex,
      answered: game.answered,
    };
    if (!on || !sounds || !running()) return;
    const sameQuestion = prev.questionIndex === game.questionIndex;
    if (
      sounds.tick &&
      game.state === 'ANSWERING' &&
      sameQuestion &&
      game.answered > prev.answered
    ) {
      void playEffect(sounds.tickUrl, synthTick);
    }
    if (sounds.gong && prev.state === 'ANSWERING' && game.state === 'REVEAL' && sameQuestion) {
      void playEffect(sounds.gongUrl, synthGong);
    }
  }, [on, sounds, game.state, game.questionIndex, game.answered]);

  // The track: while players answer, unless the question plays its own sound.
  const trackUrl = on ? (sounds?.musicUrl ?? null) : null;
  const plays = !!trackUrl && game.state === 'ANSWERING' && !questionHasOwnSound(game.media);
  // A pause ducks it (it picks up where it was), never stops it.
  useEffect(() => {
    if (on) setBusDucked('music', game.paused);
  }, [on, game.paused]);
  useEffect(() => {
    if (!plays || !trackUrl || !running()) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void loadSound(trackUrl).then((buffer) => {
      if (!cancelled && buffer) stop = playBuffer(buffer, 'music', { loop: true });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [plays, trackUrl, game.questionIndex]);
}
