import { SETTINGS } from '@quiz-dock/contracts';
import { settings } from '../admin/settings/settings.service';

/** The version this image was built as (`APP_VERSION`, the release tag), without its `v`. */
export const appVersion = (): string =>
  settings.get(SETTINGS.APP_VERSION).trim().replace(/^v/, '') || 'dev';
