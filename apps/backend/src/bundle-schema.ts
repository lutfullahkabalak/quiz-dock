import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE_GUIDE_FILE, bundleGuideText } from './quizzes/portable/bundle-guide';
import { BUNDLE_SCHEMA_FILE, bundleJsonSchemaText } from './quizzes/portable/bundle-json-schema';

/**
 * Writes the bundle JSON Schema of the current manifest version and the format
 * guide at the repo root (`pnpm generate:schema`). Earlier schema versions stay
 * as they were published; the guide always describes the current importer.
 */
const ROOT = join(__dirname, '..', '..', '..');
writeFileSync(join(ROOT, BUNDLE_SCHEMA_FILE), bundleJsonSchemaText());
writeFileSync(join(ROOT, BUNDLE_GUIDE_FILE), bundleGuideText());
