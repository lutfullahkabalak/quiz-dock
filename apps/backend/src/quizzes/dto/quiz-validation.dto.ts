import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TEXT_QUIZ_MAX_BYTES } from '../portable/text-quiz-validation';
export class QuizValidationInputDto extends createZodDto(
  z.object({ json: z.string().max(TEXT_QUIZ_MAX_BYTES) }),
) {}
export class QuizValidationResultDto extends createZodDto(
  z.object({
    valid: z.boolean(),
    errors: z.array(
      z.object({
        code: z.enum([
          'import.invalid_bundle',
          'import.invalid_item',
          'import.media_missing',
          'import.bundle_too_large',
        ]),
        item: z.number().int().optional(),
        field: z.string().optional(),
        path: z.string().optional(),
        detail: z.string().optional(),
      }),
    ),
  }),
) {}
