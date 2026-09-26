import { useState } from 'react';

export type ListView = 'list' | 'grid';

/**
 * A page's list or grid, as last chosen in this browser only (a convenience,
 * never required): a private window or blocked storage just starts on `fallback`.
 */
export function useStoredView(
  key: string,
  fallback: ListView = 'list',
): [ListView, (view: ListView) => void] {
  const [view, setView] = useState<ListView>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === 'grid' || stored === 'list' ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (next: ListView) => {
    setView(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // private window, storage blocked: the choice lasts this visit
    }
  };
  return [view, choose];
}
