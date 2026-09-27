import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The operator's `/branding/override.css` must come after the app's own
 * stylesheet: both set `:root`, and of two equal rules the later one wins.
 * Vite adds the app's stylesheet at the end of `<head>` (build) or as styles
 * in `<head>` (dev), so the override belongs in `<body>`, after the app.
 */
describe('the branding override stylesheet', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

  it('loads after the app, in the body', () => {
    const override = html.indexOf('/branding/override.css');
    const app = html.indexOf('/src/main.tsx');
    expect(override).toBeGreaterThan(html.indexOf('<body>'));
    expect(override).toBeGreaterThan(app);
  });
});
