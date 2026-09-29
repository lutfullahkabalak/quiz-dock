import { Body, Controller, HttpCode, HttpException, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuizValidationInputDto, QuizValidationResultDto } from './dto/quiz-validation.dto';
import { validateTextQuiz } from './portable/text-quiz-validation';
@ApiTags('quizzes')
@Controller('quizzes')
export class QuizValidationController {
  private readonly windows = new Map<string, { until: number; count: number }>();
  @Post('validate')
  @HttpCode(200)
  @ApiOkResponse({ type: QuizValidationResultDto })
  validate(
    @CurrentUser() user: User,
    @Body() body: QuizValidationInputDto,
  ): QuizValidationResultDto {
    const now = Date.now();
    for (const [id, window] of this.windows) if (window.until <= now) this.windows.delete(id);
    let window = this.windows.get(user.id);
    if (!window) {
      if (this.windows.size >= 1000) throw new HttpException('import.validation_busy', 429);
      window = { until: now + 60_000, count: 0 };
      this.windows.set(user.id, window);
    }
    if (window.count++ >= 60) throw new HttpException('import.validation_busy', 429);
    return validateTextQuiz(body.json);
  }
}
