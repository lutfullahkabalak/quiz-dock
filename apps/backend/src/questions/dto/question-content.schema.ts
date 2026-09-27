import {
  AUDIO_TARGETS,
  IMAGE_CHOICE_OPTION_COUNTS,
  OPTION_ALT_MAX,
  WAVEFORM_SIZES,
  questionMediaSchema,
} from '@quiz-dock/contracts';
import { z } from 'zod';
import { backgroundFields, noBackgroundConflict } from '../../common/background.schema';

/**
 * Normalise une réponse texte pour comparaison (RG-06) : minuscule, sans accent,
 * espaces superflus retirés. Calculé côté serveur (le client n'envoie que `text`).
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Answer colours and shapes, in the order the editor gives them to options 1 to 8. */
export const OPTION_COLORS = [
  'red',
  'blue',
  'yellow',
  'green',
  'purple',
  'orange',
  'pink',
  'teal',
] as const;
export const OPTION_SHAPES = [
  'triangle',
  'diamond',
  'circle',
  'square',
  'star',
  'hexagon',
  'heart',
  'cross',
] as const;
/** How many options a type with options takes. */
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 8;
export const POINTS_MODES = ['standard', 'double', 'none', 'fixed'] as const;

const optionInputSchema = z.object({
  text: z.string().trim().max(500).optional(),
  mediaId: z.string().length(26).optional(),
  // The picture's alternative text, in the quiz's language (image_choice).
  alt: z.string().trim().max(OPTION_ALT_MAX).optional(),
  color: z.enum(OPTION_COLORS),
  shape: z.enum(OPTION_SHAPES),
  isCorrect: z.boolean().default(false),
  correctOrderIndex: z.number().int().min(0).optional(),
});

const acceptedAnswerInputSchema = z.object({
  text: z.string().trim().min(1).max(200),
});

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'text_input',
  'numeric',
  'ordering',
  'poll',
  'image_choice',
] as const;

/** Scoring variants each type accepts besides `standard`. */
export const SCORING_BY_TYPE: Record<(typeof QUESTION_TYPES)[number], readonly string[]> = {
  single_choice: [],
  multiple_choice: ['partial'],
  true_false: [],
  text_input: ['lenient'],
  numeric: ['closest'],
  ordering: ['partial'],
  poll: [],
  // `partial` only with several right pictures (checked below).
  image_choice: ['partial'],
};

/** Types reposant sur une liste d'options affichées. */
const OPTION_TYPES = new Set([
  'single_choice',
  'multiple_choice',
  'true_false',
  'ordering',
  'poll',
  'image_choice',
]);

/**
 * Contenu d'une question, avec validation **par type** (technique §4, RG-03).
 * Bornes alignées sur les CHECK SQL (timeLimitS 5–120, tolérance ≥ 0).
 */
export const questionContentSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1).max(1000),
    // Markdown, shown at REVEAL only (#5). `null` clears it.
    answerExplanation: z.string().trim().max(2000).nullable().optional(),
    ...backgroundFields,
    // Visual + audio slots (shared contract: never a video with an audio track).
    media: questionMediaSchema.optional(),
    timeLimitS: z.number().int().min(5).max(120).default(20),
    // Auto-mode delay on REVEAL (#6); null = engine default. Bounds match the SQL CHECK.
    revealDelayS: z.number().int().min(1).max(300).nullable().optional(),
    // Which devices play its sound; null = the game's default.
    audioTarget: z.enum(AUDIO_TARGETS).nullable().optional(),
    // How thick its waveform is drawn on the screens.
    waveformSize: z.enum(WAVEFORM_SIZES).default('M'),
    // Listen first: the timer starts when the media ends (a known duration is needed).
    timerAfterMedia: z.boolean().default(false),
    pointsMode: z.enum(POINTS_MODES).default('standard'),
    // Per-type scoring rule (see `SCORING_BY_TYPE`); `standard` everywhere by default.
    scoring: z.enum(['standard', 'closest', 'partial', 'lenient']).default('standard'),
    numericValue: z.number().optional(),
    numericTolerance: z.number().min(0).optional(),
    // image_choice: several pictures may be right.
    multiSelect: z.boolean().default(false),
    options: z.array(optionInputSchema).max(OPTIONS_MAX).default([]),
    acceptedAnswers: z.array(acceptedAnswerInputSchema).max(20).default([]),
  })
  .superRefine((d, ctx) => {
    const err = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: 'custom', message, path });
    const correct = d.options.filter((o) => o.isCorrect).length;
    if (!noBackgroundConflict(d)) err('slide.background_conflict', ['backgroundGradient']);
    if (d.scoring !== 'standard' && !SCORING_BY_TYPE[d.type].includes(d.scoring)) {
      err('Scoring variant not available for this type.', ['scoring']);
    }

    // Champs interdits hors de leur type.
    if (!OPTION_TYPES.has(d.type) && d.options.length > 0) {
      err('Aucune option permise pour ce type.', ['options']);
    }
    if (d.type !== 'text_input' && d.acceptedAnswers.length > 0) {
      err('Réponses acceptées réservées au type text_input.', ['acceptedAnswers']);
    }
    if (d.type !== 'numeric' && (d.numericValue != null || d.numericTolerance != null)) {
      err('Champs numériques réservés au type numeric.', ['numericValue']);
    }
    if (d.type !== 'image_choice' && d.multiSelect) {
      err('multiSelect is reserved to the image_choice type.', ['multiSelect']);
    }

    switch (d.type) {
      case 'single_choice':
        if (d.options.length < OPTIONS_MIN || d.options.length > OPTIONS_MAX)
          err('Entre 2 et 8 options requises.', ['options']);
        if (correct !== 1) err('Exactement une option correcte requise.', ['options']);
        break;
      case 'multiple_choice':
        if (d.options.length < OPTIONS_MIN || d.options.length > OPTIONS_MAX)
          err('Entre 2 et 8 options requises.', ['options']);
        if (correct < 1) err('Au moins une option correcte requise.', ['options']);
        break;
      case 'true_false':
        if (d.options.length !== 2) err('Vrai/Faux requiert exactement 2 options.', ['options']);
        if (correct !== 1) err('Exactement une option correcte requise.', ['options']);
        break;
      case 'poll':
        if (d.options.length < OPTIONS_MIN || d.options.length > OPTIONS_MAX)
          err('Entre 2 et 8 options requises.', ['options']);
        if (correct > 0) err('Un sondage n’a pas de bonne réponse.', ['options']);
        break;
      case 'ordering': {
        if (d.options.length < OPTIONS_MIN || d.options.length > OPTIONS_MAX)
          err('Entre 2 et 8 options requises.', ['options']);
        const idx = d.options.map((o) => o.correctOrderIndex);
        if (idx.some((i) => i == null)) {
          err('Chaque option doit porter un correctOrderIndex (type ordering).', ['options']);
        } else {
          const sorted = [...(idx as number[])].sort((a, b) => a - b);
          if (!sorted.every((v, i) => v === i))
            err('Les correctOrderIndex doivent former une permutation 0..n-1.', ['options']);
        }
        break;
      }
      case 'text_input':
        if (d.acceptedAnswers.length < 1)
          err('Au moins une réponse acceptée requise.', ['acceptedAnswers']);
        break;
      case 'image_choice':
        if (!(IMAGE_CHOICE_OPTION_COUNTS as readonly number[]).includes(d.options.length))
          err('An image choice takes 2 or 4 pictures.', ['options']);
        if (d.multiSelect ? correct < 1 : correct !== 1)
          err(
            d.multiSelect
              ? 'At least one right picture required.'
              : 'Exactly one right picture required.',
            ['options'],
          );
        if (d.scoring === 'partial' && !d.multiSelect)
          err('Partial credit needs several right pictures.', ['scoring']);
        d.options.forEach((o, i) => {
          if (!o.mediaId) err('Each answer needs a picture.', ['options', i, 'mediaId']);
          if (!o.alt) err('Each picture needs its alternative text.', ['options', i, 'alt']);
          if (o.text) err('An image choice answer has no text.', ['options', i, 'text']);
        });
        // The answers are the pictures: no picture or video of the question's own.
        if (d.media?.visual) err('An image choice has no visual of its own.', ['media']);
        break;
      case 'numeric':
        if (d.numericValue == null)
          err('numericValue requis pour le type numeric.', ['numericValue']);
        if (d.numericTolerance == null)
          err('numericTolerance requis pour le type numeric.', ['numericTolerance']);
        break;
    }
  });

export type QuestionContent = z.infer<typeof questionContentSchema>;
