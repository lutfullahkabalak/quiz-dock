import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
export const communityEntrySchema = z.object({
  key: z.string(),
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  tags: z.array(z.string()),
  license: z.string(),
  questionCount: z.number().int(),
  author: z.string(),
  registry: z.string(),
  source: z.string(),
  homepage: z.string().nullable(),
  reportUrl: z.string().nullable(),
  updatedAt: z.string(),
  size: z.number().int(),
});
export class CommunityCatalogueDto extends createZodDto(
  z.object({
    enabled: z.boolean(),
    entries: z.array(communityEntrySchema),
    unavailable: z.array(z.string()),
  }),
) {}
export class CommunityTakeDto extends createZodDto(
  z.object({ key: z.string().regex(/^[a-f0-9]{64}$/) }),
) {}
export class CommunityPreviewDto extends createZodDto(
  z.object({
    title: z.string(),
    items: z.array(
      z.object({
        kind: z.enum(['question', 'slide']),
        text: z.string(),
        options: z.array(z.string()),
      }),
    ),
  }),
) {}
