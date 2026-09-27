import { createZodDto } from 'nestjs-zod';
import { AUDIO_TARGETS } from '@quiz-dock/contracts';
import { z } from 'zod';
import { gradientSchema, slideBlockSchema } from './slide-content.schema';

/** A slide as returned by the API (#7). Position = `beforeQuestionId` (null = end) + `orderIndex`. */
export const slideSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  beforeQuestionId: z.string().nullable(),
  orderIndex: z.number().int(),
  blocks: z.array(slideBlockSchema),
  /** Full-cover background media, if any: an image or a video. */
  mediaId: z.string().nullable(),
  gradient: gradientSchema.nullable(),
  backgroundLoop: z.boolean(),
  backgroundSound: z.boolean(),
  audioTarget: z.enum(AUDIO_TARGETS).nullable(),
  textTone: z.enum(['light', 'dark']),
  textOutline: z.boolean(),
  displayDelayS: z.number().int().nullable(),
});

export class SlideDto extends createZodDto(slideSchema) {}
