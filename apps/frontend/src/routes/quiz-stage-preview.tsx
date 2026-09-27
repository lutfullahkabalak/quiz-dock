import {
  type SlideBlock,
  type SlideGradient,
  type SlideShowPayload,
  fillSlideBlocks,
  quizVariables,
} from '@quiz-dock/contracts';
import { AudioLines } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/markdown';
import { COLOR_BG, OPTION_BG_FALLBACK, SHAPE_GLYPH } from '@/lib/option-style';
import { cn } from '@/lib/utils';
import type {
  QuizDetailDto,
  QuizDetailDtoQuestionsItem,
  QuizDetailDtoSlidesItem,
} from '../api/generated/model';

/**
 * A quiz's steps as they will show, still: what the preview walks through and
 * the read-only view lays out, each on the 1280×720 stage.
 */

/** The quiz's fields its slides' variables read (`{title}`, `{questions}`…). */
export function slideQuizFieldsOf(quiz: QuizDetailDto) {
  return {
    title: quiz.title,
    description: quiz.description,
    questionCount: quiz.questionCount,
    ...(quiz.ownerName ? { author: quiz.ownerName } : {}),
    tags: quiz.tags,
    license: quiz.license,
  };
}

/** A stored slide as the screens would get it, the quiz's variables filled. */
export function slideShowOf(
  slide: QuizDetailDtoSlidesItem,
  index: number,
  quizFields?: Parameters<typeof quizVariables>[0],
): SlideShowPayload {
  const blocks = slide.blocks as SlideBlock[];
  return {
    slideIndex: index,
    questionIndex: 0,
    blocks: quizFields ? fillSlideBlocks(blocks, quizVariables(quizFields)) : blocks,
    background: slide.mediaId
      ? { url: `/api/v1/media/${slide.mediaId}` }
      : slide.gradient
        ? { gradient: slide.gradient as SlideGradient }
        : null,
    // Its video, shown still (its first frame) behind the content.
    video: slide.videoMediaId
      ? {
          url: `/api/v1/media/${slide.videoMediaId}`,
          loop: slide.videoLoop,
          sound: slide.videoSound,
          gainDb: 0,
        }
      : null,
    textTone: slide.textTone,
    textOutline: slide.textOutline,
    displayDelayS: slide.displayDelayS,
  };
}

/** A question laid out on the 1280×720 stage: fixed sizes, scaled with the box. */
export function QuestionPreview({ question }: { question: QuizDetailDtoQuestionsItem }) {
  const { t } = useTranslation('editor');
  return (
    <article className="flex h-full w-full flex-col justify-center gap-5 p-12">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {t(`questionType.${question.type}`, { defaultValue: question.type })}
      </div>
      {question.media?.visual?.kind === 'image' && (
        <img
          className="max-h-[260px] self-center object-contain"
          src={`/api/v1/media/${question.media?.visual.assetId}`}
          alt=""
        />
      )}
      {question.media?.visual?.kind === 'video' && 'assetId' in question.media.visual ? (
        // Its first frame, still: the preview plays nothing.
        <video
          className="max-h-[260px] self-center rounded-lg object-contain"
          src={`/api/v1/media/${question.media?.visual.assetId}#t=0.1`}
          preload="metadata"
          muted
          aria-label={t('preview.video')}
        />
      ) : null}
      {question.media?.audio ? (
        <div className="text-muted-foreground flex items-center gap-2 self-center text-xl">
          <AudioLines className="size-6" aria-hidden />
          {t('preview.sound', { seconds: Math.round(question.media?.audio.durationMs / 1000) })}
        </div>
      ) : null}
      <Markdown role="heading" aria-level={2} className="text-4xl font-semibold">
        {question.prompt}
      </Markdown>
      <div className="text-muted-foreground text-xl">⏱ {question.timeLimitS} s</div>

      {question.options.length > 0 && (
        <ul className="grid grid-cols-2 gap-4">
          {question.options.map((opt) => (
            <li
              key={opt.id}
              className={cn(
                'flex items-center gap-3 rounded-lg font-semibold text-white',
                'px-6 py-4 text-2xl',
                COLOR_BG[opt.color] ?? OPTION_BG_FALLBACK,
                opt.isCorrect && 'outline outline-2 outline-offset-2 outline-success',
              )}
            >
              <span className="text-3xl" aria-hidden="true">
                {SHAPE_GLYPH[opt.shape] ?? '◆'}
              </span>
              <span className="flex-1">
                {opt.text ?? t('preview.optionFallback', { index: opt.orderIndex + 1 })}
              </span>
              {question.type === 'ordering' && opt.correctOrderIndex != null && (
                <span className="rounded-full bg-black/25 px-2">#{opt.correctOrderIndex + 1}</span>
              )}
              {opt.isCorrect && <span aria-label={t('preview.correctAnswer')}>✓</span>}
            </li>
          ))}
        </ul>
      )}

      {question.acceptedAnswers.length > 0 && (
        <div className="text-lg text-muted-foreground">
          {t('preview.acceptedAnswers', {
            answers: question.acceptedAnswers.map((a) => a.text).join(', '),
          })}
        </div>
      )}

      {question.type === 'numeric' && question.numericValue != null && (
        <div className="text-lg text-muted-foreground">
          {t('preview.numericTarget', {
            value: question.numericValue,
            tolerance: question.numericTolerance ?? 0,
          })}
        </div>
      )}
    </article>
  );
}
