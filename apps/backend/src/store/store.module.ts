import { Module } from '@nestjs/common';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

import { CommunityController } from './community/community.controller';
import { CommunityService } from './community/community.service';

@Module({
  imports: [QuizzesModule],
  controllers: [StoreController, CommunityController],
  providers: [StoreService, CommunityService],
  exports: [StoreService],
})
export class StoreModule {}
