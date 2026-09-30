import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { QuizValidationInputDto, QuizValidationResultDto } from './dto/quiz-validation.dto';
import { validateTextQuiz } from './portable/text-quiz-validation';
@ApiTags('quizzes')
@Controller('quizzes')
export class QuizValidationController {
  @Post('validate')
  @HttpCode(200)
  @ApiOkResponse({ type: QuizValidationResultDto })
  validate(@Body() body: QuizValidationInputDto): QuizValidationResultDto {
    return validateTextQuiz(body.json);
  }
}
