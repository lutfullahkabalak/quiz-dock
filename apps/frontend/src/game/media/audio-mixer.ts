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
  return mixer;
}

/** Where a source of `bus` plugs in; null without Web Audio. */
export function busInput(bus: Bus): AudioNode | null {
  return getMixer()?.strips[bus].level ?? null;
}

const ramp = (param: AudioParam, ctx: AudioContext, value: number) =>
  param.setTargetAtTime(value, ctx.currentTime, RAMP_S);

/** A bus's level (0..1): a host's volume for the music or the effects. */
export function setBusLevel(bus: Bus, level: number): void {
  const m = getMixer();
  if (m) ramp(m.strips[bus].level.gain, m.ctx, Math.min(1, Math.max(0, level)));
}

/** Steps a bus aside (`true`) or back (`false`): the music while a question plays its own sound. */
export function setBusDucked(bus: Bus, ducked: boolean): void {
  const m = getMixer();
  if (m) ramp(m.strips[bus].duck.gain, m.ctx, ducked ? 0 : 1);
}

/** The whole page silent or not: a participant's own mute. */
export function setMasterMuted(muted: boolean): void {
  const m = getMixer();
  if (m) ramp(m.master.gain, m.ctx, muted ? 0 : 1);
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

/** For the tests: forget the mixer (a new fake context builds a new one). */
export function resetMixerForTests(): void {
  mixer = null;
}
