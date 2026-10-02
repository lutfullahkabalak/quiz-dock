import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENV_EXAMPLE_FILE,
  SETTINGS_DATA_FILE,
  envExampleText,
  settingsDataText,
} from './settings-docs';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('what is generated from the settings registry', () => {
  it(`${SETTINGS_DATA_FILE} is the current environment reference (pnpm generate:settings-docs)`, () => {
    expect(read(SETTINGS_DATA_FILE)).toBe(settingsDataText());
  });

  it(`${ENV_EXAMPLE_FILE} is the current one (pnpm generate:settings-docs)`, () => {
    expect(read(ENV_EXAMPLE_FILE)).toBe(envExampleText());
  });
});
