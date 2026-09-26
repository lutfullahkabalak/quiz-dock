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
 * **duck** (automatic, from the game's state — the music steps aside while a
 * question plays its own sound), so a volume change never fights a duck.
 * MASTER carries the participant's own mute; the limiter keeps simultaneous
 * sources from clipping.
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
}

const DEVICE_KEY = 'live.sound';
const FULL: Record<Bus, number> = { quiz: 1, music: 1, sfx: 1, ui: 1 };

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
      };
    }
  } catch {
    /* storage unavailable or garbled: the defaults */
  }
  return { volume: 1, muted: false, trims: { ...FULL } };
}

let device: DeviceSound = loadDevice();
const roomLevels: Record<Bus, number> = { ...FULL };
const deviceListeners = new Set<() => void>();

const masterValue = () => (device.muted ? 0 : device.volume);
const busValue = (bus: Bus) => clamp(roomLevels[bus] * device.trims[bus]);

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

export async function routeElement(el: HTMLMediaElement, gainDb: number): Promise<void> {
  const linear = 10 ** (gainDb / 20);
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
  { loop = false, gain = 1 }: { loop?: boolean; gain?: number } = {},
): () => void {
  const m = getMixer();
  if (!m) return () => undefined;
  const source = m.ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  const own = m.ctx.createGain();
  own.gain.value = gain;
  source.connect(own).connect(m.strips[bus].level);
  source.start();
  return () => {
    ramp(own.gain, m.ctx, 0);
    source.stop(m.ctx.currentTime + RAMP_S * 4);
  };
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
