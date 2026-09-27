import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';

@Module({
  imports: [MediaModule],
  controllers: [SlidesController],
  providers: [SlidesService],
})
export class SlidesModule {}
