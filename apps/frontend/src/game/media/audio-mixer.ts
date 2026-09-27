import { useSyncExternalStore } from 'react';
import { audioContext, isAudioUnlocked } from './audio-unlock';

/**
 * The page's audio routing (SPECIFICATIONS-MEDIA §9). Every source plays into a
 * bus, never straight to the speakers:
 *
 *   question's sound / video ─ loudness gain ─► QUIZ  ─┐
 *   background track ────────────────────────► MUSIC ─┤
 *   tick, gong (synthesised or a sample) ───► SFX   ─┼─► MASTER ─► limiter ─► speakers
 *   interface sounds (to come) ─────────────► UI    ─┘
 *
 * Each bus is two gains in a row: its **level** (a host's volume) and its
 * **duck** (from the game's state), so a volume change never fights a duck.
 * MASTER carries the participant's own mute; the limiter keeps simultaneous
 * sources from clipping. Faders are tapered (`faderGain`): half-way is quiet,
 * not loud.
 */
export const BUSES = ['quiz', 'music', 'sfx', 'ui'] as const;
export type Bus = (typeof BUSES)[number];

interface Strip {
  level: GainNode;
  duck: GainNode;
}

interface Mixer {
  ctx: AudioContext;
  strips: Record<Bus, Strip>;
  master: GainNode;
}

/** How fast a bus moves to a new level (s, the time constant of the ramp). */
const RAMP_S = 0.12;

let mixer: Mixer | null = null;

/** The page's mixer, built on first need on the shared context; null without Web Audio. */
export function getMixer(): Mixer | null {
  if (mixer) return mixer;
  const ctx = audioContext();
  if (!ctx) return null;
  const master = ctx.createGain();
  // A limiter more than a compressor: only what would clip is held back.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);
  const strips = {} as Record<Bus, Strip>;
  for (const bus of BUSES) {
    const level = ctx.createGain();
    const duck = ctx.createGain();
    level.connect(duck).connect(master);
    strips[bus] = { level, duck };
  }
  mixer = { ctx, strips, master };
  // What this device chose before (its volume, mute and trims) holds from the start.
  master.gain.value = masterValue();
  for (const bus of BUSES) strips[bus].level.gain.value = busValue(bus);
  return mixer;
}

/** Where a source of `bus` plugs in; null without Web Audio. */
export function busInput(bus: Bus): AudioNode | null {
  return getMixer()?.strips[bus].level ?? null;
}

const ramp = (param: AudioParam, ctx: AudioContext, value: number) =>
  param.setTargetAtTime(value, ctx.currentTime, RAMP_S);

const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** A bus's level (0..1), as it is applied: see `setRoomLevel` and `setLocalTrim`. */
export function setBusLevel(bus: Bus, value: number): void {
  const m = getMixer();
  if (m) ramp(m.strips[bus].level.gain, m.ctx, clamp(value));
}

/** Steps a bus aside (`true`) or back (`false`): the music while a question plays its own sound. */
export function setBusDucked(bus: Bus, ducked: boolean): void {
  const m = getMixer();
  if (m) ramp(m.strips[bus].duck.gain, m.ctx, ducked ? 0 : 1);
}

/**
 * What this device hears — its own choice, kept on it (SPECIFICATIONS-MEDIA §9.2):
 * a volume and a mute on MASTER, and a trim per bus. A bus plays at the room's
 * level (the host's, for MUSIC and SFX) times this device's trim.
 */
export interface DeviceSound {
  volume: number;
  muted: boolean;
  trims: Record<Bus, number>;
  /** A bus switched off on this device, its trim kept for when it is back. */
  mutes: Record<Bus, boolean>;
}

const DEVICE_KEY = 'live.sound';
const FULL: Record<Bus, number> = { quiz: 1, music: 1, sfx: 1, ui: 1 };
const ALL_ON: Record<Bus, boolean> = { quiz: false, music: false, sfx: false, ui: false };

function loadDevice(): DeviceSound {
  try {
    const raw = JSON.parse(
      localStorage.getItem(DEVICE_KEY) ?? 'null',
    ) as Partial<DeviceSound> | null;
    if (raw && typeof raw === 'object') {
      return {
        volume: clamp(raw.volume ?? 1),
        muted: raw.muted === true,
        trims: { ...FULL, ...(raw.trims ?? {}) },
        mutes: { ...ALL_ON, ...(raw.mutes ?? {}) },
      };
    }
  } catch {
    /* storage unavailable or garbled: the defaults */
  }
  return { volume: 1, muted: false, trims: { ...FULL }, mutes: { ...ALL_ON } };
}

let device: DeviceSound = loadDevice();
const roomLevels: Record<Bus, number> = { ...FULL };
const deviceListeners = new Set<() => void>();

/**
 * A fader's position (0..1) as a gain: cubed, close to how loudness is heard —
 * half-way is about −18 dB, not the −6 dB a straight line gives (which sounds
 * nearly as loud as the top).
 */
export const faderGain = (position: number) => clamp(position) ** 3;

const masterValue = () => (device.muted ? 0 : faderGain(device.volume));
const busValue = (bus: Bus) =>
  device.mutes[bus] ? 0 : clamp(faderGain(roomLevels[bus]) * faderGain(device.trims[bus]));

function saveDevice(next: DeviceSound): void {
  device = next;
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
  deviceListeners.forEach((l) => l());
}

/** The host's level for a bus (MUSIC, SFX), times this device's trim. */
export function setRoomLevel(bus: Bus, value: number): void {
  roomLevels[bus] = clamp(value);
  setBusLevel(bus, busValue(bus));
}

/** This device's volume (MASTER). */
export function setDeviceVolume(volume: number): void {
  saveDevice({ ...device, volume: clamp(volume) });
  const m = getMixer();
  if (m) ramp(m.master.gain, m.ctx, masterValue());
}

/** This device muted or not (MASTER): a participant's own mute, or "Without sound". */
export function setDeviceMuted(muted: boolean): void {
  saveDevice({ ...device, muted });
  const m = getMixer();
  if (m) ramp(m.master.gain, m.ctx, masterValue());
}

/** This device's trim of one bus (its local mixer). */
export function setLocalTrim(bus: Bus, trim: number): void {
  saveDevice({ ...device, trims: { ...device.trims, [bus]: clamp(trim) } });
  setBusLevel(bus, busValue(bus));
}

/** One bus off (or back on) on this device: its trim stays for when it comes back. */
export function setLocalMute(bus: Bus, muted: boolean): void {
  saveDevice({ ...device, mutes: { ...device.mutes, [bus]: muted } });
  setBusLevel(bus, busValue(bus));
}

/** React view of this device's sound choices. */
export function useDeviceSound(): DeviceSound {
  return useSyncExternalStore(
    (l) => {
      deviceListeners.add(l);
      return () => deviceListeners.delete(l);
    },
    () => device,
    () => device,
  );
}

/** The whole page silent or not (this device's mute). */
export function setMasterMuted(muted: boolean): void {
  setDeviceMuted(muted);
}

/**
 * Routes a media element into the QUIZ bus through its own gain (the loudness
 * correction), once the context runs; otherwise leaves it alone — a suspended
 * context would silence it. An element is routed once in its life (the phones
 * reuse theirs); later calls only set its gain.
 */
const routed = new WeakMap<HTMLMediaElement, GainNode>();
/** Each routed element's level (its loudness correction): what a fade-in goes back to. */
const levels = new WeakMap<HTMLMediaElement, number>();

/**
 * The fades every start and stop gets: a media the host plays, pauses or moves,
 * a sample, the background track. In, just enough to take the click off the
 * attack (the sound keeps its punch); out, long enough not to hear a cut.
 */
export const FADE_IN_S = 0.005;
export const FADE_OUT_S = 0.12;
/**
 * A background track fades long, in and out: it is a bed under the game, not a
 * playback with an attack — it makes way for a question's sound and comes back.
 */
export const TRACK_FADE_S = 1.5;

/**
 * Fades a routed element in (to its level) or out (to silence); resolves when
 * done. An element the mixer does not hold (no Web Audio, a context not running)
 * cannot fade: it resolves at once and plays or stops as it is.
 */
export function fadeElement(
  el: HTMLMediaElement,
  to: 'in' | 'out',
  /** How long it takes (s); the short attack or release when omitted. A bed passes TRACK_FADE_S. */
  spanS?: number,
): Promise<void> {
  const gain = routed.get(el);
  const m = mixer;
  if (!gain || !m) return Promise.resolve();
  const target = to === 'in' ? (levels.get(el) ?? 1) : 0;
  // A context not running cannot ramp: set the level at once, never left at the silence
  // a fade in starts from.
  if (m.ctx.state !== 'running') {
    gain.gain.cancelScheduledValues(0);
    gain.gain.value = target;
    return Promise.resolve();
  }
  const span = spanS ?? (to === 'in' ? FADE_IN_S : FADE_OUT_S);
  const t = m.ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(target, t + span);
  return new Promise((resolve) => setTimeout(resolve, span * 1000));
}

/** Silences a routed element at once, before a play that fades it in. */
export function muteElementForFade(el: HTMLMediaElement): void {
  const gain = routed.get(el);
  if (!gain || !mixer) return;
  gain.gain.cancelScheduledValues(mixer.ctx.currentTime);
  gain.gain.setValueAtTime(0, mixer.ctx.currentTime);
}

export async function routeElement(el: HTMLMediaElement, gainDb: number): Promise<void> {
  const linear = 10 ** (gainDb / 20);
  levels.set(el, linear);
  const existing = routed.get(el);
  if (existing) {
    existing.gain.value = linear;
    return;
  }
  const m = getMixer();
  if (!m) return;
  // Another click in this window (the fullscreen button) unlocked sound too: wake the context.
  if (m.ctx.state === 'suspended' && isAudioUnlocked()) {
    await m.ctx.resume().catch(() => undefined);
  }
  if (m.ctx.state !== 'running') return;
  try {
    const gain = m.ctx.createGain();
    gain.gain.value = linear;
    m.ctx.createMediaElementSource(el).connect(gain).connect(m.strips.quiz.level);
    routed.set(el, gain);
  } catch {
    // Already routed elsewhere, or not allowed: it plays at its own level.
  }
}

/**
 * Plays a decoded sound into `bus` — a sample, or the background track looped.
 * Returns how to stop it (a short fade, no click).
 */
export function playBuffer(
  buffer: AudioBuffer,
  bus: Bus,
  {
    loop = false,
    gain = 1,
    fadeInS = FADE_IN_S,
    fadeOutS = FADE_OUT_S,
    at,
    rate = 1,
  }: {
    loop?: boolean;
    gain?: number;
    fadeInS?: number;
    fadeOutS?: number;
    /** When it starts, on the context's clock; now when omitted. */
    at?: number;
    /** Playback rate: below 1, lower and longer (the countdown's tac from its tic). */
    rate?: number;
  } = {},
): () => void {
  const m = getMixer();
  if (!m) return () => undefined;
  const source = m.ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.playbackRate.value = rate;
  const own = m.ctx.createGain();
  // In from silence: a sample that starts mid-wave does not click.
  const t = Math.max(at ?? 0, m.ctx.currentTime);
  own.gain.setValueAtTime(0, t);
  own.gain.linearRampToValueAtTime(gain, t + fadeInS);
  source.connect(own).connect(m.strips[bus].level);
  source.start(t);
  return () => {
    const now = m.ctx.currentTime;
    // Scheduled and not started yet: it never plays.
    if (now < t) {
      source.stop();
      return;
    }
    own.gain.cancelScheduledValues(now);
    own.gain.setValueAtTime(own.gain.value, now);
    own.gain.linearRampToValueAtTime(0, now + fadeOutS);
    source.stop(now + fadeOutS + 0.02);
  };
}

/**
 * A background track that plays and holds in turn, looped: held, it fades out
 * and stops, keeping its place; played again, it comes back in where it was —
 * never from the top at each question.
 */
export function loopTrack(
  buffer: AudioBuffer,
  bus: Bus,
  { fadeInS = FADE_IN_S, fadeOutS = FADE_OUT_S }: { fadeInS?: number; fadeOutS?: number } = {},
): { play: () => void; hold: () => void } {
  let source: AudioBufferSourceNode | null = null;
  let own: GainNode | null = null;
  let startedAt = 0;
  let offset = 0;
  const hold = () => {
    const m = mixer;
    if (!m || !source || !own) return;
    const now = m.ctx.currentTime;
    offset = (offset + (now - startedAt)) % buffer.duration;
    own.gain.cancelScheduledValues(now);
    own.gain.setValueAtTime(own.gain.value, now);
    own.gain.linearRampToValueAtTime(0, now + fadeOutS);
    source.stop(now + fadeOutS + 0.02);
    source = null;
    own = null;
  };
  const play = () => {
    const m = getMixer();
    if (!m || source) return;
    source = m.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    own = m.ctx.createGain();
    const now = m.ctx.currentTime;
    own.gain.setValueAtTime(0, now);
    own.gain.linearRampToValueAtTime(1, now + fadeInS);
    source.connect(own).connect(m.strips[bus].level);
    source.start(now, offset);
    startedAt = now;
  };
  return { play, hold };
}

/** For the tests: forget the mixer and this device's choices. */
export function resetMixerForTests(): void {
  mixer = null;
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    /* no storage */
  }
  device = loadDevice();
  Object.assign(roomLevels, FULL);
}
