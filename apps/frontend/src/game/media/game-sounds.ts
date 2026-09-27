import {
  type LiveQuestionMedia,
  type MediaAnchor,
  type RoomSoundsPayload,
  mediaDurationMs,
} from '@quiz-dock/contracts';
import { serverNow } from '../clock';
import { unlockAudio } from './audio-unlock';
import { useEffect, useRef, useState } from 'react';
import {
  TRACK_FADE_S,
  busInput,
  getMixer,
  loopTrack,
  playBuffer,
  setRoomLevel,
} from './audio-mixer';

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

const noop = () => undefined;

/**
 * A gong: eight inharmonic sine partials, slightly detuned for a metallic sheen,
 * the low ones louder, under a low-pass that darkens from 7 kHz to 500 Hz. No
 * mallet noise: struck after a countdown, a noise attack reads as one click too
 * many. `at` on the context's clock (now when omitted); the cancel stops it if it
 * has not started yet.
 */
export function synthGong(at?: number): () => void {
  const mixer = getMixer();
  const into = busInput('sfx');
  if (!mixer || !into) return noop;
  const { ctx } = mixer;
  const t = Math.max(at ?? 0, ctx.currentTime);
  const out = ctx.createGain();
  out.gain.value = 0.8;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(7000, t);
  lowpass.frequency.exponentialRampToValueAtTime(500, t + 2.5);
  out.connect(lowpass).connect(into);
  const oscs: OscillatorNode[] = [];
  [105, 168, 211, 337, 480, 551, 719, 890].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.01);
    const g = ctx.createGain();
    const level = 0.75 / (i * 0.5 + 1);
    const duration = 1.4 + Math.random() * 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.1);
    oscs.push(osc);
  });
  return () => {
    if (ctx.currentTime < t) oscs.forEach((o) => o.stop());
  };
}

/**
 * A ding as a question starts: one bright tone with two discreet harmonics for
 * the crystal (no low body, or it turns into a cowbell), and a short struck
 * transient for a clean attack.
 */
export function synthDing(at?: number): () => void {
  const mixer = getMixer();
  const into = busInput('sfx');
  if (!mixer || !into) return noop;
  const { ctx } = mixer;
  const t = Math.max(at ?? 0, ctx.currentTime);
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(into);
  const sources: AudioScheduledSourceNode[] = [];
  for (const { freq, level, decay } of [
    { freq: 1550, level: 1, decay: 1.1 },
    { freq: 2300, level: 0.18, decay: 0.6 },
    { freq: 3150, level: 0.08, decay: 0.35 },
  ]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.1);
    sources.push(osc);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = seededNoise(ctx, 0.015);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 3200;
  band.Q.value = 0.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
  noise.connect(band).connect(ng).connect(out);
  noise.start(t);
  sources.push(noise);
  return () => {
    if (ctx.currentTime < t) sources.forEach((s) => s.stop());
  };
}

/** One noise for every countdown click, drawn once from a fixed seed: each tic, each tac sounds the same. */
const noises = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();
function seededNoise(ctx: BaseAudioContext, seconds = 0.03): AudioBuffer {
  const mine = noises.get(ctx) ?? new Map<number, AudioBuffer>();
  noises.set(ctx, mine);
  const known = mine.get(seconds);
  if (known) return known;
  const size = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b1d3a;
  for (let i = 0; i < size; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5; // xorshift32
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  mine.set(seconds, buffer);
  return buffer;
}

/** A mechanical click of the countdown: the fixed noise through a band-pass at `freq`, 30 ms. */
export function synthClick(at: number, freq: number): () => void {
  const mixer = getMixer();
  const into = busInput('sfx');
  if (!mixer || !into) return noop;
  const { ctx } = mixer;
  const t = Math.max(at, ctx.currentTime);
  const noise = ctx.createBufferSource();
  noise.buffer = seededNoise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = 4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  noise.connect(band).connect(g).connect(into);
  noise.start(t);
  return () => {
    if (ctx.currentTime < t) noise.stop();
  };
}

/** The countdown: tic on the second, tac on the half, over its last seconds. */
const COUNTDOWN_S = 5;
const TIC_HZ = 1800;
const TAC_HZ = 1100;

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

/**
 * Plays an effect: its sample when the room gave one, else the synthesised one —
 * now, or at `at` on the context's clock. Returns how to cancel it before it starts.
 */
function playEffect(
  url: string | null,
  synth: (at?: number) => (() => void) | void,
  at?: number,
  rate = 1,
): () => void {
  if (!url) return synth(at) ?? noop;
  let cancelled = false;
  let cancel: () => void = noop;
  void loadSound(url).then((buffer) => {
    if (cancelled) return;
    // A sample that does not load: the room still hears something.
    cancel = buffer ? playBuffer(buffer, 'sfx', { at, rate }) : (synth(at) ?? noop);
  });
  return () => {
    cancelled = true;
    cancel();
  };
}

/** The room's effects, by their switch in the room's sounds. */
export type RoomEffect = 'ding' | 'tick' | 'countdown' | 'gong';

/**
 * Plays one of the room's effects here, for the host to hear it before the room
 * does (the console plays nothing of the game otherwise): its sample when the room
 * has one, else the synthesised one. The countdown: tic, tac, tic, a beat of
 * silence, then the gong.
 */
export async function previewEffect(effect: RoomEffect, sounds: RoomSoundsPayload): Promise<void> {
  await unlockAudio();
  const ctx = getMixer()?.ctx;
  if (!ctx) return;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  if (effect === 'ding') playEffect(sounds.dingUrl, synthDing);
  else if (effect === 'tick') playEffect(sounds.tickUrl, synthTick);
  else if (effect === 'gong') playEffect(sounds.gongUrl, synthGong);
  else {
    const t = ctx.currentTime + 0.05;
    for (const [slot, tic] of [
      [0, true],
      [1, false],
      [2, true],
    ] as const) {
      playEffect(
        sounds.countdownUrl,
        (when) => synthClick(when ?? t + slot * 0.5, tic ? TIC_HZ : TAC_HZ),
        t + slot * 0.5,
        tic ? 1 : TAC_HZ / TIC_HZ,
      );
    }
    playEffect(sounds.gongUrl, synthGong, t + 2);
  }
}

/** What the game's sounds follow of a live view. */
export interface GameSoundsState {
  state: string | null;
  questionIndex: number;
  answered: number;
  paused: boolean;
  media: LiveQuestionMedia | null | undefined;
  /** When the question's media starts, on the server's clock (`question:start`). */
  mediaStartAt?: number | null;
  /** Where the host put it from the console, for this question. */
  anchor?: MediaAnchor | null;
  /** When the question's time runs out, on the server's clock (`question:start`). */
  endsAt?: number | null;
  /** When the answers open, on the server's clock: the reading (or listening) comes first. */
  startedAt?: number | null;
}

/**
 * When the question's own sound or video is over, on the server's clock: from
 * its common start, or from the host's last command on it. `null` while it
 * cannot be said to end — held by the host, or of unknown length.
 */
export function mediaEndsAt(
  media: LiveQuestionMedia | null | undefined,
  mediaStartAt: number | null | undefined,
  anchor: MediaAnchor | null | undefined,
): number | null {
  const durationMs = mediaDurationMs(media);
  if (!durationMs) return null;
  if (anchor) return anchor.playing ? anchor.at + durationMs - anchor.t * 1000 : null;
  return mediaStartAt != null ? mediaStartAt + durationMs : null;
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
    // A bus the host switched off plays at 0; its level comes back with it.
    setRoomLevel('music', sounds.musicMuted ? 0 : sounds.musicLevel);
    setRoomLevel('sfx', sounds.sfxMuted ? 0 : sounds.sfxLevel);
  }, [on, sounds]);

  const last = useRef<{ state: string | null; questionIndex: number; answered: number }>({
    state: null,
    questionIndex: -1,
    answered: 0,
  });
  const running = () => getMixer()?.ctx.state === 'running';
  // The gong the countdown struck on zero, so the reveal does not strike it again.
  const countdownGong = useRef<{ questionIndex: number; at: number } | null>(null);

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
    // The last answer moves the question to its reveal: its count arrives with the
    // new state, and it still gets its tick (before the gong).
    const answering =
      game.state === 'ANSWERING' || (game.state === 'REVEAL' && prev.state === 'ANSWERING');
    if (sounds.tick && answering && sameQuestion && game.answered > prev.answered) {
      playEffect(sounds.tickUrl, synthTick);
    }
    // The ding: a new question starts (not over its own sound or video).
    if (
      sounds.ding &&
      game.state === 'ANSWERING' &&
      (!sameQuestion || prev.state !== 'ANSWERING') &&
      !questionHasOwnSound(game.media)
    ) {
      playEffect(sounds.dingUrl, synthDing);
    }
    // The gong at the reveal — unless the countdown already struck it at zero.
    const struck = countdownGong.current?.questionIndex === game.questionIndex;
    if (
      sounds.gong &&
      !struck &&
      prev.state === 'ANSWERING' &&
      game.state === 'REVEAL' &&
      sameQuestion
    ) {
      playEffect(sounds.gongUrl, synthGong);
    }
  }, [on, sounds, game.state, game.questionIndex, game.answered, game.media]);

  // The countdown: tic… tac… over the last five seconds of the time, on the server's
  // clock, the last tac left out so a clear silence leads to the gong, struck on zero
  // itself (the reveal comes a moment later). Everyone answered before the end, or a
  // pause: what has not sounded yet is called off — the reveal brings the gong.
  useEffect(() => {
    const endsAt = game.endsAt;
    if (!on || !sounds?.countdown || game.state !== 'ANSWERING' || game.paused || !endsAt) {
      return;
    }
    // An end already gone by: the previous question's, until this one's `question:start`
    // arrives — nothing to count down (it would strike the gong now).
    if (endsAt <= serverNow()) return;
    const ctx = getMixer()?.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const toCtx = (serverMs: number) => ctx.currentTime + (serverMs - serverNow()) / 1000;
    const cancels: (() => void)[] = [];
    const first = endsAt - COUNTDOWN_S * 1000;
    // Ten half-beats, the last (a tac) left out.
    for (let slot = 0; slot < COUNTDOWN_S * 2 - 1; slot++) {
      const at = first + slot * 500;
      // Already gone by (a question shorter than the countdown); one just due still sounds.
      if (at < serverNow() - 50) continue;
      const tic = slot % 2 === 0;
      // A sample of the room's: its tic as it is, its tac lower.
      cancels.push(
        playEffect(
          sounds.countdownUrl,
          (when) => synthClick(when ?? toCtx(at), tic ? TIC_HZ : TAC_HZ),
          toCtx(at),
          tic ? 1 : TAC_HZ / TIC_HZ,
        ),
      );
    }
    if (sounds.gong) {
      cancels.push(playEffect(sounds.gongUrl, synthGong, toCtx(endsAt)));
      countdownGong.current = { questionIndex: game.questionIndex, at: endsAt };
    }
    return () => {
      cancels.forEach((cancel) => cancel());
      // Called off before zero: the gong was not struck, the reveal strikes it.
      if (countdownGong.current && countdownGong.current.at > serverNow()) {
        countdownGong.current = null;
      }
    };
  }, [on, sounds, game.state, game.paused, game.endsAt, game.questionIndex]);

  // The track: looped while players answer, never under a question's own sound or
  // video — two sounds are never laid over each other: it fades out as that media
  // starts and comes back once it is over (from its start, or where the host put it).
  // Between questions and during a pause it fades out and keeps its place: never
  // from the top at each question. Its fades are long: a bed, not an event.
  const trackUrl = on ? (sounds?.musicUrl ?? null) : null;
  const ownSound = questionHasOwnSound(game.media);
  const endsAt = ownSound ? mediaEndsAt(game.media, game.mediaStartAt, game.anchor) : null;
  const [mediaOver, setMediaOver] = useState(false);
  useEffect(() => {
    setMediaOver(false);
    if (endsAt === null) return;
    const left = endsAt - serverNow();
    if (left <= 0) {
      setMediaOver(true);
      return;
    }
    const timer = setTimeout(() => setMediaOver(true), left);
    return () => clearTimeout(timer);
  }, [endsAt]);
  // Only once the answers open: not over the reading of the question (nor its listening).
  const [answersOpen, setAnswersOpen] = useState(false);
  useEffect(() => {
    const opens = game.startedAt;
    if (opens == null) {
      setAnswersOpen(true);
      return;
    }
    const left = opens - serverNow();
    setAnswersOpen(left <= 0);
    if (left <= 0) return;
    const timer = setTimeout(() => setAnswersOpen(true), left);
    return () => clearTimeout(timer);
  }, [game.startedAt]);
  const plays =
    !!trackUrl &&
    game.state === 'ANSWERING' &&
    !game.paused &&
    answersOpen &&
    (!ownSound || mediaOver);
  const [track, setTrack] = useState<ReturnType<typeof loopTrack> | null>(null);
  useEffect(() => {
    if (!trackUrl) return;
    let cancelled = false;
    let loaded: ReturnType<typeof loopTrack> | null = null;
    void loadSound(trackUrl).then((buffer) => {
      if (cancelled || !buffer) return;
      loaded = loopTrack(buffer, 'music', { fadeInS: TRACK_FADE_S, fadeOutS: TRACK_FADE_S });
      setTrack(loaded);
    });
    return () => {
      cancelled = true;
      loaded?.hold();
      setTrack(null);
    };
  }, [trackUrl]);
  useEffect(() => {
    if (!track) return;
    if (plays && running()) track.play();
    else track.hold();
  }, [track, plays]);
}
