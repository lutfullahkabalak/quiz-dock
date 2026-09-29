import { z } from 'zod';
import { gradientSchema } from './background';
import { AUDIO_TARGETS, WAVEFORM_SIZES } from './question-media';
import { SLIDE_TWO_SOUNDS } from './slide-media';

const blockId = z.string().min(1).max(64);

/** Leaf blocks (#7): what a slide is made of; `columns` lays them side by side. */
const leafBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    id: blockId,
    text: z.string().trim().min(1).max(200),
    level: z.union([z.literal(1), z.literal(2)]).default(1),
    align: z.enum(['left', 'center', 'right']).optional(),
  }),
  z.object({
    type: z.literal('text'),
    id: blockId,
    /** Markdown, block profile (images inside are allowed too). */
    md: z.string().trim().min(1).max(5000),
    align: z.enum(['left', 'center', 'right']).optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }),
  z.object({
    type: z.literal('image'),
    id: blockId,
    mediaId: z.string().length(26),
    size: z.enum(['small', 'medium', 'large', 'full']).default('large'),
    align: z.enum(['left', 'center', 'right']).default('center'),
  }),
]);

const columnsBlockSchema = z.object({
  type: z.literal('columns'),
  id: blockId,
  columns: z.array(z.array(leafBlockSchema).max(10)).min(2).max(3),
  /** Width split for two columns (ignored for three). */
  ratio: z.enum(['1-1', '1-2', '2-1']).optional(),
});

export const slideBlockSchema = z.union([leafBlockSchema, columnsBlockSchema]);
export type SlideBlockInput = z.infer<typeof slideBlockSchema>;

/**
 * The structure of a slide's content (#7), required on every save: blocks, an
 * optional full-cover background with its text contrast, its media, and the
 * auto-mode display time. That it shows something is its completeness
 * (`slideIssues`): a draft may wait for it, publishing may not.
 */
export const slideContentSchema = z
  .object({
    blocks: z.array(slideBlockSchema).max(30).default([]),
    mediaId: z.string().length(26).nullable().optional(),
    gradient: gradientSchema.nullable().optional(),
    // Media (#125), set like a question's: a video filling the slide behind its
    // content — looped (else played once), with its sound (else muted) — and a sound.
    videoMediaId: z.string().length(26).nullable().optional(),
    videoLoop: z.boolean().default(true),
    videoSound: z.boolean().default(true),
    audioMediaId: z.string().length(26).nullable().optional(),
    /** Hidden by default: the sound plays, the console alone draws it. */
    waveformSize: z.enum(WAVEFORM_SIZES).default('hidden'),
    /** Who hears the slide's sound; null = the game's target. */
    audioTarget: z.enum(AUDIO_TARGETS).nullable().optional(),
    textTone: z.enum(['light', 'dark']).default('light'),
    textOutline: z.boolean().default(true),
    // Auto-mode display time: null = engine default, 0 = manual override, else seconds.
    displayDelayS: z.number().int().min(0).max(600).nullable().optional(),
  })
  .refine((d) => !(d.mediaId && d.gradient), {
    message: 'slide.background_conflict',
    path: ['gradient'],
  })
  // One sound at a time: a video with its own excludes the sound, as a question's does.
  .refine((d) => !(d.videoMediaId && d.videoSound && d.audioMediaId), {
    message: SLIDE_TWO_SOUNDS,
    path: ['audioMediaId'],
  });

export type SlideContent = z.infer<typeof slideContentSchema>;

/** What completeness reads of a slide: its payload, or a stored row. */
export interface SlideCompletenessInput {
  blocks: unknown[];
  mediaId?: string | null;
  gradient?: unknown;
  videoMediaId?: string | null;
}

/** What a slide still needs to be played (UI system §1.5, level 3): to show something. */
export function slideIssues(
  s: SlideCompletenessInput,
): { code: string; path: (string | number)[] }[] {
  const shows = s.blocks.length > 0 || !!s.mediaId || !!s.gradient || !!s.videoMediaId;
  return shows ? [] : [{ code: 'slide.empty', path: ['blocks'] }];
}
