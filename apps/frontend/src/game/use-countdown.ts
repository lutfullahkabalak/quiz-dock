import { useEffect, useState } from 'react';
import { serverNow } from './clock';

/**
 * Chrono visuel dérivé des **timestamps serveur** (P3-FRONT-4). On ne compte pas
 * un délai local : on calcule le restant depuis `endsAt` (ms epoch serveur) à
 * chaque tick, ce qui reste juste après un re-render, un late join ou une reprise.
 * `endsAt = null` (hors question) → `null`. Compensation de latence = P4 (`latencyMs=0`).
 */
export function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (endsAt === null) return;
    setNow(serverNow());
    // Once the deadline is past the display stays at 0: stop, or the page would
    // re-render four times a second until the end of the game (reveal, podium…).
    const id = setInterval(() => {
      const t = serverNow();
      setNow(t);
      if (t >= endsAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** What a question's clock shows: the same on the screen, the phones and the console. */
export interface QuestionClock {
  /** Listen first, before the answers open: the count is to their opening. */
  listening: boolean;
  /** Stood still by the server (the game paused). */
  paused: boolean;
  /** Seconds left, rounded up. */
  remaining: number;
  /** The whole of what is counted, for the bar: the answers' window, or the listening. */
  totalS: number;
}

/**
 * The clock of the question being answered, from the server's timestamps (so a
 * late join, a re-render or a resume shows the same as everyone): the answers'
 * window as it is now (lengthened by the host too), or, listen first, the
 * listening before it. Paused, what the server froze, which tells both apart.
 * Null out of a question being answered.
 */
export function useQuestionClock(view: {
  state: string | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  question: {
    startedAt: number;
    endsAt: number;
    listenFirst?: boolean;
    mediaStartAt?: number | null;
  } | null;
}): QuestionClock | null {
  const q = view.question;
  const live = view.state === 'ANSWERING' && !view.paused && q !== null;
  const toEnd = useCountdown(live ? q.endsAt : null);
  const toOpen = useCountdown(live && q.listenFirst ? q.startedAt : null);
  const frozen = view.paused && view.pausedRemainingMs != null;
  if (!q || (!live && !frozen)) return null;
  const windowS = (q.endsAt - q.startedAt) / 1000;
  const listenS = (q.startedAt - (q.mediaStartAt ?? q.startedAt)) / 1000;
  if (frozen) {
    const leftS = (view.pausedRemainingMs ?? 0) / 1000;
    const listening = !!q.listenFirst && leftS > windowS;
    return {
      listening,
      paused: true,
      remaining: Math.ceil(listening ? leftS - windowS : leftS),
      totalS: listening ? listenS : windowS,
    };
  }
  const listening = (toOpen ?? 0) > 0;
  return {
    listening,
    paused: false,
    remaining: (listening ? toOpen : toEnd) ?? 0,
    totalS: listening ? listenS : windowS,
  };
}
