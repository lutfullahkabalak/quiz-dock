import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { mediaControllerSetAlt, mediaControllerSetCredit } from '../api/generated/media/media';

/** What the author changed on a media while editing a step: kept until the step is saved. */
export interface MediaEdit {
  alt?: string;
  credit?: string;
}

export interface MediaEdits {
  get: (id: string) => MediaEdit | undefined;
  set: (id: string, patch: MediaEdit) => void;
}

/**
 * The form a media field sits in (a question, a slide): its alternative text and
 * credit are saved with that form, and cancelled with it (UI system §3). Outside a
 * form (the media library), a field saves by itself.
 */
export const MediaEditsContext = createContext<MediaEdits | null>(null);

export const useMediaEditsContext = () => useContext(MediaEditsContext);

/** A form's pending media edits: `flush` writes them (with the form's save), `discard` drops them. */
export function useMediaEdits() {
  const [pending, setPending] = useState<Record<string, MediaEdit>>({});
  const edits = useMemo<MediaEdits>(
    () => ({
      get: (id) => pending[id],
      set: (id, patch) => setPending((p) => ({ ...p, [id]: { ...p[id], ...patch } })),
    }),
    [pending],
  );
  const flush = useCallback(async () => {
    for (const [id, edit] of Object.entries(pending)) {
      if (edit.alt !== undefined) await mediaControllerSetAlt(id, { alt: edit.alt });
      if (edit.credit !== undefined) await mediaControllerSetCredit(id, { credit: edit.credit });
    }
    setPending({});
  }, [pending]);
  const discard = useCallback(() => setPending({}), []);
  return { edits, flush, discard, dirty: Object.keys(pending).length > 0 };
}
