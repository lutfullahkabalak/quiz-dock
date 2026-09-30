import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TEXT_QUIZ_MAX_BYTES } from '../portable/text-quiz-validation';
export class QuizValidationInputDto extends createZodDto(
  z.object({ json: z.string().max(TEXT_QUIZ_MAX_BYTES) }),
) {}
const issueSchema = z.object({
  code: z.string(),
  item: z.number().int().optional(),
  field: z.string().optional(),
  path: z.string().optional(),
  detail: z.string().optional(),
});
export class QuizValidationResultDto extends createZodDto(
  z.object({ valid: z.boolean(), errors: issueSchema.array(), warnings: issueSchema.array() }),
) {}
