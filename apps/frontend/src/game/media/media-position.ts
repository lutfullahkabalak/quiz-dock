/**
 * Where each media of a session stood on this screen, kept in sessionStorage
 * so it survives an interruption (the host dropping out, the projection being
 * reloaded): the media then resumes a second before that point instead of
 * starting over, and the host can still take it back to the top.
 */
export interface MediaPosition {
  /** Seconds reached. */
  t: number;
  /** Played to the end: nothing to resume. */
  ended: boolean;
}

const PREFIX = 'media.pos:';

/** Seconds replayed before the point reached, so the room picks the thread up again. */
export const RESUME_REWIND_S = 1;

export function readPosition(key: string): MediaPosition | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as MediaPosition) : null;
  } catch {
    return null;
  }
}

export function writePosition(key: string, position: MediaPosition): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(position));
  } catch {
    /* storage unavailable: the media will start over */
  }
}

export function clearPosition(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Forgets every position of a room: its PIN stays from one quiz to the next (#89),
 * and a quiz played again would read its last run's "played to the end" and never
 * start. Called as a lobby opens — every game starts from one.
 */
export function clearRoomPositions(pin: string): void {
  try {
    const mine = `${PREFIX}${pin}:`;
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(mine)) sessionStorage.removeItem(key);
    }
  } catch {
    /* nothing to clear */
  }
}

/** Where to start a media that was interrupted: a second before its point, or null to start over. */
export function resumeAt(position: MediaPosition | null): number | null {
  if (!position || position.ended || position.t <= RESUME_REWIND_S) return null;
  return position.t - RESUME_REWIND_S;
}
