import { useEffect } from 'react';
import { clearDraft, saveDraft } from './draft-store';
import { useUnsavedGuard } from './use-unsaved-guard';

/**
 * A form's draft (see `draft-store`): kept while its values differ from what
 * was loaded (`initial`), dropped once they are back to it. Returns whether they
 * differ; the tab then asks before closing, and `onDirtyChange` hears it.
 */
export function useFormDraft<T>(
  key: string,
  initial: T,
  values: T,
  onDirtyChange?: (dirty: boolean) => void,
): boolean {
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => {
    if (dirty) saveDraft(key, values);
    else clearDraft(key);
  }, [dirty, values, key]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);
  return dirty;
}
