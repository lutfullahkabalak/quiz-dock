import { Injectable } from '@nestjs/common';
import { SETTINGS } from '@quiz-dock/contracts';
import { z } from 'zod';
import { RedisService } from '../../redis/redis.service';
import { settings } from '../settings/settings.service';
import { ReleaseCheck, versionStatus } from '../version/release-check';
import { type AdminOperation, defineOperation, done } from './operation';

/** The version the instance runs, against the latest release (`UPDATE_CHECK`). */
@Injectable()
export class VersionOperations {
  private readonly check: ReleaseCheck;

  constructor(redis: RedisService) {
    this.check = new ReleaseCheck(redis);
  }

  list(): AdminOperation[] {
    return [
      defineOperation({
        id: 'version.check',
        domain: 'instance',
        category: 'health',
        effect: 'read',
        summary:
          'The version this instance runs and the latest stable release, read from GitHub at most once a day (UPDATE_CHECK).',
        params: z.object({}),
        run: async () => done(await versionStatus(settings.get(SETTINGS.UPDATE_CHECK), this.check)),
      }),
    ];
  }
}
