import { type MediaAsset, Prisma } from '@prisma/client';
import type {
  OptionColor,
  OptionShape,
  PointsMode,
  PublicOption,
  QuestionScoring,
  QuestionStartPayload,
  QuestionType,
} from '@quiz-dock/contracts';
import {
  type AudioTarget,
  LOUDNESS_TARGET_LUFS,
  effectiveTimeLimitS,
  mediaDurationMs,
  playbackGainDb,
  resolveAudioTarget,
  slideHasPlayback,
  slideSoundMedia,
  slideTimedMs,
} from '@quiz-dock/contracts';
import { QUESTION_MEDIA_INCLUDE, liveMediaOf } from '../questions/question-media';
import { READ_DELAY_MS, MEDIA_LEAD_MS } from './game.keys';
import { basePointsFor } from './scoring';
import type { QuizSnapshot, SnapshotQuestion, SnapshotSlide } from './game.types';
import type {
  SlideBlock,
  SlideGradient,
  SlideLeafBlock,
  SlideShowPayload,
  SlideTextTone,
} from '@quiz-dock/contracts';

/** Forme Prisma attendue par le constructeur de snapshot (relations incluses). */
const quizWithContent = Prisma.validator<Prisma.QuizDefaultArgs>()({
  include: {
    questions: {
      orderBy: { orderIndex: 'asc' },
      include: {
        ...QUESTION_MEDIA_INCLUDE,
        backgroundMedia: true,
        options: { orderBy: { orderIndex: 'asc' }, include: { media: true } },
        acceptedAnswers: true,
      },
    },
    slides: { orderBy: { orderIndex: 'asc' }, include: { media: true } },
  },
});
/** Whether a question plays a sound: an MP3, or a video's own track. */
export function questionHasSound(q: SnapshotQuestion): boolean {
  return !!q.media?.audio || q.media?.visual?.kind === 'video';
}

/** Whether a slide plays a sound: a Sound block, a Video block or a background with theirs (#125). */
export function slideHasSound(slide: SnapshotSlide): boolean {
  return slideSoundMedia(slide) !== null;
}

/**
 * Whether any question or slide plays a sound or a video: the screens ask for
 * sound, players pick a presence.
 */
export function snapshotHasSound(snapshot: QuizSnapshot): boolean {
  return snapshot.questions.some(questionHasSound) || snapshot.slides.some(slideHasPlayback);
}

/** Which devices play this slide's sound: its own target, else the game's (#125). */
export function slideAudioTarget(slide: SnapshotSlide, gameTarget: AudioTarget): AudioTarget {
  return resolveAudioTarget(slide.audioTarget ?? null, gameTarget, null);
}

/** The game's default audio target: the host's lobby choice, else the quiz's. */
export function gameAudioTarget(
  snapshot: QuizSnapshot,
  sessionTarget: AudioTarget | '' | null | undefined,
): AudioTarget {
  return resolveAudioTarget(null, sessionTarget || null, snapshot.audioTarget);
}

/** Which devices play this question's sound: its own target, else the game's. */
export function questionAudioTarget(q: SnapshotQuestion, gameTarget: AudioTarget): AudioTarget {
  return resolveAudioTarget(q.audioTarget, gameTarget, null);
}

/** Listen first applies only when the media's length is known (else: the usual timing). */
function listensFirst(q: QuizWithContent['questions'][number]): boolean {
  return q.timerAfterMedia && mediaDurationMs(liveMediaOf(q)) !== null;
}

export type QuizWithContent = Prisma.QuizGetPayload<typeof quizWithContent>;
export const QUIZ_SNAPSHOT_INCLUDE = quizWithContent.include;

/** An option's picture. `alt` travels with it (#43): the screens have no other description. */
const optionImageOf = (m: { url: string; kind: string; alt?: string | null } | null) =>
  m?.kind === 'image' ? { url: m.url, kind: 'image' as const, alt: m.alt ?? null } : null;

/** Reading window before the answers open (configurable, like the engine reads it). */
const readDelayMs = () => Number(process.env.GAME_READ_DELAY_MS ?? READ_DELAY_MS);

/**
 * Construit le snapshot serveur figé d'un quiz (SPECIFICATIONS §8). Fonction pure :
 * résout les points de base depuis `pointsMode`, embarque les bonnes réponses
 * (secret serveur) et les réponses texte normalisées. La boucle live ne touche
 * plus la base après cet appel.
 */
export function buildSnapshot(
  quiz: QuizWithContent,
  /** The assets the slides' blocks point at (see {@link slideBlockMediaIds}). */
  slideAssets: SlideAssets = new Map(),
): QuizSnapshot {
  return {
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    language: quiz.language,
    feedbackEnabled: quiz.feedbackEnabled,
    audioTarget: quiz.audioTarget,
    questions: quiz.questions.map(
      (q): SnapshotQuestion => ({
        id: q.id,
        orderIndex: q.orderIndex,
        type: q.type as QuestionType,
        prompt: q.prompt,
        media: liveMediaOf(q, quiz.loudnessTargetLufs),
        answerExplanation: q.answerExplanation ?? null,
        background: q.backgroundMedia
          ? { url: q.backgroundMedia.url }
          : q.backgroundGradient
            ? { gradient: q.backgroundGradient as unknown as SlideGradient }
            : null,
        textTone: q.textTone as SlideTextTone,
        textOutline: q.textOutline,
        // Stretched when the media would still be playing (quiz-wide pause after it):
        // the timer, the display and the speed weighting all read this one value.
        // Listen first: the timer only starts once the media has played, nothing to stretch.
        timeLimitS: listensFirst(q)
          ? q.timeLimitS
          : effectiveTimeLimitS(
              q.timeLimitS,
              mediaDurationMs(liveMediaOf(q)),
              quiz.mediaTailS,
              // The media starts MEDIA_LEAD_MS after the question: that much less of it
              // plays during the reading.
              readDelayMs() - MEDIA_LEAD_MS,
            ),
        timerAfterMedia: listensFirst(q),
        revealDelayS: q.revealDelayS ?? null,
        audioTarget: q.audioTarget ?? null,
        basePoints: basePointsFor(q.pointsMode as PointsMode),
        pointsMode: q.pointsMode as PointsMode,
        scoring: q.scoring as QuestionScoring,
        numericValue: q.numericValue === null ? null : Number(q.numericValue),
        numericTolerance: q.numericTolerance === null ? null : Number(q.numericTolerance),
        acceptedAnswersNormalized: q.acceptedAnswers.map((a) => a.normalized),
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          color: o.color as OptionColor,
          shape: o.shape as OptionShape,
          media: optionImageOf(o.media),
          isCorrect: o.isCorrect,
          correctOrderIndex: o.correctOrderIndex,
        })),
      }),
    ),
    slides: buildSnapshotSlides(quiz, slideAssets),
  };
}

/**
 * Slides (#7) resolved onto question indexes: anchored before the question they
 * reference, or after the last one when unanchored. Sorted by (anchor, orderIndex).
 */
function buildSnapshotSlides(quiz: QuizWithContent, assets: SlideAssets): SnapshotSlide[] {
  const indexById = new Map(quiz.questions.map((q, i) => [q.id, i]));
  return orderSlides(quiz.slides, indexById, quiz.questions.length).map(({ slide, anchor }) =>
    snapshotSlide(slide, anchor, assets, quiz.loudnessTargetLufs, quiz.mediaTailS),
  );
}

/** Slides anchored on question indexes (the end when unanchored), sorted by (anchor, order). */
function orderSlides(
  slides: QuizWithContent['slides'],
  indexById: Map<string, number>,
  end: number,
) {
  return slides
    .map((slide) => ({
      slide,
      anchor:
        slide.beforeQuestionId === null ? end : (indexById.get(slide.beforeQuestionId) ?? end),
    }))
    .sort((a, b) => a.anchor - b.anchor || a.slide.orderIndex - b.slide.orderIndex);
}

/** The assets of the slides' Video and Sound blocks, by id (#125). */
export type SlideAssets = Map<string, MediaAsset>;

/** The media ids a quiz's slides' blocks point at: what {@link buildSnapshot} needs looked up. */
export function slideBlockMediaIds(quiz: QuizWithContent): string[] {
  const ids = new Set<string>();
  for (const slide of quiz.slides) {
    for (const b of (slide.blocks as SlideBlock[]).flatMap((x) =>
      x.type === 'columns' ? x.columns.flat() : [x],
    )) {
      if (b.type === 'video' || b.type === 'audio') ids.add(b.mediaId);
    }
  }
  return [...ids];
}

function snapshotSlide(
  slide: QuizWithContent['slides'][number],
  anchor: number,
  assets: SlideAssets,
  targetLufs: number = LOUDNESS_TARGET_LUFS,
  mediaTailS = 0,
): SnapshotSlide {
  const gain = (m: MediaAsset) => playbackGainDb(m.loudnessLufs, m.peakDbfs, targetLufs);
  const bg = slide.media;
  const backgroundVideo =
    bg?.kind === 'video'
      ? {
          url: bg.url,
          loop: slide.backgroundLoop,
          sound: slide.backgroundSound,
          gainDb: gain(bg),
          ...(bg.durationMs ? { durationMs: bg.durationMs } : {}),
        }
      : null;
  const blocks = resolveBlocks(slide.blocks as SlideBlock[], assets, gain);
  const timedMs = slideTimedMs({ blocks, backgroundVideo });
  return {
    id: slide.id,
    beforeQuestionIndex: anchor,
    blocks,
    background:
      bg?.kind === 'image'
        ? { url: bg.url }
        : slide.gradient
          ? { gradient: slide.gradient as unknown as SlideGradient }
          : null,
    backgroundVideo,
    audioTarget: slide.audioTarget ?? null,
    mediaHoldMs: timedMs === null ? null : timedMs + mediaTailS * 1000,
    textTone: slide.textTone as SlideTextTone,
    textOutline: slide.textOutline,
    displayDelayS: slide.displayDelayS,
  };
}

/**
 * Blocks with what the screens play them from: an image's served URL, a video's
 * or a sound's URL, loudness gain, length and waveform (#125). A Video or Sound
 * block whose asset is gone is left out — nothing to play.
 */
function resolveBlocks(
  blocks: SlideBlock[],
  assets: SlideAssets,
  gain: (m: MediaAsset) => number,
): SlideBlock[] {
  const leaf = (b: SlideLeafBlock): SlideLeafBlock[] => {
    if (b.type === 'image') return [{ ...b, url: `/api/v1/media/${b.mediaId}` }];
    if (b.type !== 'video' && b.type !== 'audio') return [b];
    const asset = assets.get(b.mediaId);
    if (!asset || asset.kind !== b.type) return [];
    const common = {
      url: asset.url,
      gainDb: gain(asset),
      ...(asset.durationMs ? { durationMs: asset.durationMs } : {}),
    };
    return b.type === 'video' ? [{ ...b, ...common }] : [{ ...b, ...common, peaks: asset.peaks }];
  };
  return blocks.flatMap((b): SlideBlock[] =>
    b.type === 'columns' ? [{ ...b, columns: b.columns.map((c) => c.flatMap(leaf)) }] : leaf(b),
  );
}

/**
 * Public `slide:show` payload (#7): everything in a slide is meant to be shown.
 * With media (#125): who hears its sound, and when every device starts them.
 */
export function buildSlideShow(
  slide: SnapshotSlide,
  slideIndex: number,
  /** The game's default audio target (see {@link gameAudioTarget}). */
  gameTarget?: AudioTarget,
  /** When the slide's media start (server ms epoch), 0 or absent when it plays none. */
  mediaStartAt?: number,
): SlideShowPayload {
  return {
    slideIndex,
    questionIndex: slide.beforeQuestionIndex,
    blocks: slide.blocks,
    background: slide.background,
    ...(slide.backgroundVideo ? { backgroundVideo: slide.backgroundVideo } : {}),
    ...(gameTarget && slideHasSound(slide)
      ? { audioTarget: slideAudioTarget(slide, gameTarget) }
      : {}),
    ...(mediaStartAt ? { mediaStartAt } : {}),
    textTone: slide.textTone,
    textOutline: slide.textOutline,
    displayDelayS: slide.displayDelayS,
  };
}

/**
 * Construit le payload public `question:start` (contrat §9) par **allowlist stricte**
 * (anti-triche §7) : on ne recopie QUE `{id,text,color,shape,media}` des options —
 * jamais `isCorrect`/`correctOrderIndex`, ni la cible numérique/réponses texte.
 * Le secret ne fuit pas par oubli de suppression : il n'est jamais ajouté.
 */
export function buildQuestionStart(
  question: SnapshotQuestion,
  questionIndex: number,
  startedAt: number,
  endsAt: number,
  /** The game's default audio target (see {@link gameAudioTarget}). */
  gameTarget: AudioTarget,
  /** `startedAt − mediaStartAt`, null when the question plays nothing (see `GameMeta`). */
  mediaLeadMs: number | null,
): QuestionStartPayload {
  const hasOptions = question.options.length > 0;
  const options: PublicOption[] | undefined = hasOptions
    ? question.options.map((o) => ({
        id: o.id,
        text: o.text,
        color: o.color,
        shape: o.shape,
        media: o.media,
      }))
    : undefined;
  return {
    questionIndex,
    type: question.type,
    prompt: question.prompt,
    media: question.media,
    ...(questionHasSound(question)
      ? { audioTarget: questionAudioTarget(question, gameTarget) }
      : {}),
    options,
    timeLimitS: question.timeLimitS,
    basePoints: question.basePoints,
    scoring: question.scoring ?? 'standard',
    startedAt,
    endsAt,
    ...(mediaLeadMs !== null && startedAt > 0 ? { mediaStartAt: startedAt - mediaLeadMs } : {}),
    ...(question.timerAfterMedia ? { listenFirst: true } : {}),
    background: question.background,
    textTone: question.textTone,
    textOutline: question.textOutline,
  };
}

/**
 * Live refresh of the **form** of a running session: the substance of the
 * questions (list and order, type, prompt, media, options, right answers,
 * scoring, timing) stays frozen from the launch so statistics remain
 * consistent; what only affects the display follows the editor — backgrounds,
 * text contrast, answer explanation, reveal delay, who hears the sound — and the slides in full
 * (they carry no history). Questions are matched by id; a question deleted
 * meanwhile keeps its frozen version.
 */
export function refreshSnapshotForm(
  frozen: QuizSnapshot,
  current: QuizWithContent,
  slideAssets: SlideAssets = new Map(),
): QuizSnapshot {
  const fresh = buildSnapshot(current, slideAssets);
  const freshById = new Map(fresh.questions.map((q) => [q.id, q]));
  const questions = frozen.questions.map((q): SnapshotQuestion => {
    const now = freshById.get(q.id);
    if (!now) return q;
    return {
      ...q,
      background: now.background,
      textTone: now.textTone,
      textOutline: now.textOutline,
      answerExplanation: now.answerExplanation,
      revealDelayS: now.revealDelayS,
      audioTarget: now.audioTarget,
    };
  });
  // Slides anchor on question ids in the editor; resolve them onto the frozen order.
  const indexById = new Map(frozen.questions.map((q, i) => [q.id, i]));
  const slides = orderSlides(current.slides, indexById, frozen.questions.length).map(
    ({ slide, anchor }) =>
      snapshotSlide(slide, anchor, slideAssets, current.loudnessTargetLufs, current.mediaTailS),
  );
  return {
    ...frozen,
    title: fresh.title,
    description: fresh.description,
    feedbackEnabled: fresh.feedbackEnabled,
    audioTarget: fresh.audioTarget,
    questions,
    slides,
  };
}
