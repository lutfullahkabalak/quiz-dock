import { useSyncExternalStore } from 'react';

/**
 * Sound in the projection window. A browser plays sound only after the person
 * has interacted with *that* page; a click in the console is another window and
 * does not count. So the projection asks once, at the lobby, and this module
 * keeps the answer — plus the one AudioContext every sound's gain goes through.
 */
let context: AudioContext | null = null;
let unlocked = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/** Whether the page already had a user gesture (sticky activation), which lets media play. */
function hasBeenActive(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return activation?.hasBeenActive ?? false;
}

/** The page's AudioContext, created on first need (it starts suspended without a gesture). */
export function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Whether sound may play here without being refused. */
export function isAudioUnlocked(): boolean {
  return unlocked || hasBeenActive();
}

/**
 * Unlocks sound from inside a click: resumes the context and plays a blip of
 * silence through it. Must run in the gesture's own call stack.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = audioContext();
  try {
    if (ctx) {
      const silence = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = silence;
      source.connect(ctx.destination);
      source.start();
      await ctx.resume();
    }
    unlocked = true;
  } catch {
    unlocked = hasBeenActive();
  }
  notify();
  return unlocked;
}

/** React view of {@link isAudioUnlocked}. */
export function useAudioUnlocked(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isAudioUnlocked,
    () => false,
  );
}
