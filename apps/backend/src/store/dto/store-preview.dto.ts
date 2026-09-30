import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { questionSchema } from '../../questions/dto/question.dto';
import { slideSchema } from '../../slides/dto/slide.dto';

/**
 * Ce qu'on voit d'un modèle **avant** d'en prendre une copie (#39) : ses questions
 * et ses diapositives dans la forme de celles d'un quiz, lues par l'import même
 * qui fera la copie. L'éditeur les dessine avec l'aperçu d'un quiz.
 */
export const storePreviewSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  tags: z.array(z.string()),
  license: z.string().nullable(),
  author: z.object({ name: z.string(), subject: z.string() }),
  revision: z.number().int(),
  sharedAt: z.string(),
  coverUrl: z.string().nullable(),
  questionCount: z.number().int(),
  slideCount: z.number().int(),
  questions: questionSchema.array(),
  slides: slideSchema.array(),
  /** Each media's stand-in id, and the catalogue URL that serves its file. */
  media: z.record(z.string(), z.string()),
  /** What a copy would refuse: an item (1-based), or the manifest (`item: null`); null when whole. */
  invalid: z.object({ item: z.number().int().nullable() }).nullable(),
});

export class StorePreviewDto extends createZodDto(storePreviewSchema) {}
