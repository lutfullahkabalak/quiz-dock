import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENV_EXAMPLE_FILE,
  SETTINGS_DATA_FILE,
  envExampleText,
  settingsDataText,
} from './admin/settings/settings-docs';

/**
 * Writes what is generated from the settings registry
 * (`pnpm generate:settings-docs`): the environment reference the website reads
 * at each release, and the development stack's `.env.example`.
 */
const ROOT = join(__dirname, '..', '..', '..');
writeFileSync(join(ROOT, SETTINGS_DATA_FILE), settingsDataText());
writeFileSync(join(ROOT, ENV_EXAMPLE_FILE), envExampleText());
