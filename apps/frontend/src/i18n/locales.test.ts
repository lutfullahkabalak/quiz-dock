import { describe, expect, it } from 'vitest';
import { namespaces, supportedLngs } from './index';

// Every locale file, read here directly: the app loads one language only.
const files = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', {
  eager: true,
  import: 'default',
});
const resources = Object.fromEntries(
  supportedLngs.map((lang) => [
    lang,
    Object.fromEntries(namespaces.map((ns) => [ns, files[`./locales/${lang}/${ns}.json`]])),
  ]),
);

/** Flattens nested translation objects into dotted keys, recursively. */
function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => flatKeys(v, prefix ? `${prefix}.${k}` : k));
}

/**
 * Every language must carry exactly the keys of `en`, namespace by namespace:
 * a missing key silently falls back to English, an orphan one is dead weight.
 */
describe('locale key parity', () => {
  const reference = resources.en as Record<string, unknown>;

  for (const lang of supportedLngs) {
    if (lang === 'en') continue;
    it(`${lang} matches en`, () => {
      const translated = resources[lang] as Record<string, unknown>;
      const problems: string[] = [];
      for (const [ns, enDict] of Object.entries(reference)) {
        const enKeys = new Set(flatKeys(enDict));
        const langKeys = new Set(flatKeys(translated[ns] ?? {}));
        const missing = [...enKeys].filter((k) => !langKeys.has(k));
        const extra = [...langKeys].filter((k) => !enKeys.has(k));
        if (missing.length) problems.push(`${ns}: missing ${missing.join(', ')}`);
        if (extra.length) problems.push(`${ns}: extra ${extra.join(', ')}`);
      }
      expect(problems, `${lang} differs from en:\n${problems.join('\n')}`).toEqual([]);
    });
  }
});
