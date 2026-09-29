import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AllowAnyRole } from '../../auth/allow-any-role.decorator';
import { QuizDto } from '../../quizzes/dto/quiz.dto';
import { CommunityService } from './community.service';
import { CommunityCatalogueDto, CommunityPreviewDto, CommunityTakeDto } from './community.dto';
@ApiTags('community-store')
@Controller('community-store')
export class CommunityController {
  constructor(private readonly store: CommunityService) {}
  @Get()
  @AllowAnyRole()
  @ApiOkResponse({ type: CommunityCatalogueDto })
  list() {
    return this.store.list();
  }
  @Get(':key')
  @AllowAnyRole()
  @ApiOkResponse({ type: CommunityPreviewDto })
  preview(@Param('key') key: string) {
    return this.store.preview(key);
  }
  @Post('take')
  @ApiOkResponse({ type: QuizDto })
  take(@CurrentUser() user: User, @Body() body: CommunityTakeDto) {
    return this.store.take(user.id, body.key);
  }
}
