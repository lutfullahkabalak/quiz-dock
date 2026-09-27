import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AUDIO_TARGETS,
  type AudioTarget,
  WAVEFORM_SIZES,
  WAVEFORM_SIZE_DEFAULT,
  type WaveformSize,
  MEDIA_TAIL_DEFAULT_S,
  NO_QUESTION_MEDIA,
  effectiveTimeLimitS,
  type QuestionMedia,
  type SlideGradient,
  type SlideTextTone,
  questionMediaSchema,
} from '@quiz-dock/contracts';
import { useForm, useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { clearDraft, loadDraft, saveDraft } from '@/lib/draft-store';
import { DraftNotice } from '@/components/draft-notice';
import { MarkdownEditor } from '@/components/markdown-editor';
import { promptImage } from '@/lib/prompt-image';
import { mediaControllerDescribe, mediaControllerSetAlt } from '../api/generated/media/media';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { COLOR_BG, OPTION_BG_FALLBACK } from '@/lib/option-style';
import { cn } from '@/lib/utils';
import { errorText } from '../api/error-text';
import { apiErrorText } from '../api/http';
import type { QuizDetailDtoQuestionsItem } from '../api/generated/model';
import { BackgroundField, NO_BACKGROUND, type BackgroundValue } from './background-field';
import { Waveform } from '../game/media/waveform';
import { QuestionMediaField, useMediaDurationMs } from './question-media-field';
import {
  useQuestionsControllerAdd,
  useQuestionsControllerUpdate,
} from '../api/generated/questions/questions';
import { getQuizzesControllerGetQueryKey } from '../api/generated/quizzes/quizzes';
import { ShapeIcon } from '@/components/shape-icon';
import { ImageChoiceOptions, imageOptionComplete } from './image-choice-options';

type QType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'text_input'
  | 'numeric'
  | 'ordering'
  | 'poll'
  | 'image_choice';

type Scoring = 'standard' | 'closest' | 'partial' | 'lenient';
/** Scoring variants each type offers besides the standard rule (mirrors the API schema). */
const SCORING_BY_TYPE: Record<string, Scoring[]> = {
  single_choice: [],
  multiple_choice: ['partial'],
  true_false: [],
  text_input: ['lenient'],
  numeric: ['closest'],
  ordering: ['partial'],
  poll: [],
  image_choice: ['partial'],
};
/** The variants a question offers: an image choice gives partial credit only with several right pictures. */
const scoringsFor = (type: QType, multiSelect: boolean): Scoring[] =>
  type === 'image_choice' && !multiSelect ? [] : SCORING_BY_TYPE[type];
const TYPES: QType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'text_input',
  'numeric',
  'ordering',
  'poll',
  'image_choice',
];

// Eight distinct colour+shape pairs, one per position: no two options ever look alike (max 8).
const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'teal'] as const;
const SHAPES = [
  'triangle',
  'diamond',
  'circle',
  'square',
  'star',
  'hexagon',
  'heart',
  'cross',
] as const;
const OPTION_TYPES: QType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'ordering',
  'poll',
  'image_choice',
];
const SINGLE_CORRECT: QType[] = ['single_choice', 'true_false'];

interface OptionValue {
  /** Client-only stable key (drag and drop); never sent. */
  key: string;
  text: string;
  color: string;
  shape: string;
  isCorrect: boolean;
  correctOrderIndex: number;
  /** An answer's picture: an image choice's, or one kept from an import. */
  mediaId: string | null;
  /** Its alternative text, in the quiz's language (image choice). */
  alt: string;
}
interface FormValues {
  type: QType;
  prompt: string;
  /** Visual + audio slots, in the contract's shape (never a video with a sound). */
  media: QuestionMedia;
  answerExplanation: string;
  background: BackgroundValue;
  timeLimitS: number;
  revealDelayS: number | null;
  /** Which devices play its sound; null = the game's default. */
  audioTarget: AudioTarget | null;
  /** How thick the sound's waveform is drawn on the screens. */
  waveformSize: WaveformSize;
  /** Listen first: the timer starts when the media ends. */
  timerAfterMedia: boolean;
  pointsMode: 'standard' | 'double' | 'none' | 'fixed';
  scoring: Scoring;
  numericValue: number;
  numericTolerance: number;
  /** Image choice: several pictures may be right. */
  multiSelect: boolean;
  options: OptionValue[];
  acceptedAnswers: { text: string }[];
}

// Unique across page loads too: a restored draft keeps the keys of the previous load
// (a counter alone starts over at each load and would hand one out again).
let optionSeq = 0;
const optionKey = () => `opt-${Date.now().toString(36)}-${++optionSeq}`;

function newOption(i: number, text = ''): OptionValue {
  return {
    key: optionKey(),
    text,
    color: COLORS[i % COLORS.length],
    shape: SHAPES[i % SHAPES.length],
    isCorrect: false,
    correctOrderIndex: i,
    mediaId: null,
    alt: '',
  };
}

function initialValues(q?: QuizDetailDtoQuestionsItem): FormValues {
  if (!q) {
    return {
      type: 'single_choice',
      prompt: '',
      media: NO_QUESTION_MEDIA,
      answerExplanation: '',
      background: NO_BACKGROUND,
      timeLimitS: 20,
      revealDelayS: null,
      audioTarget: null,
      waveformSize: WAVEFORM_SIZE_DEFAULT,
      timerAfterMedia: false,
      pointsMode: 'standard',
      scoring: 'standard',
      numericValue: 0,
      numericTolerance: 0,
      multiSelect: false,
      options: [newOption(0), newOption(1)],
      acceptedAnswers: [],
    };
  }
  return {
    type: q.type as QType,
    prompt: q.prompt,
    media: (q.media as QuestionMedia | undefined) ?? NO_QUESTION_MEDIA,
    answerExplanation: q.answerExplanation ?? '',
    background: {
      mediaId: q.backgroundMediaId ?? null,
      gradient: (q.backgroundGradient as SlideGradient | null | undefined) ?? null,
      textTone: (q.textTone as SlideTextTone | undefined) ?? 'light',
      textOutline: q.textOutline ?? true,
    },
    timeLimitS: q.timeLimitS,
    revealDelayS: q.revealDelayS ?? null,
    audioTarget: (q.audioTarget as AudioTarget | null | undefined) ?? null,
    waveformSize: (q.waveformSize as WaveformSize | undefined) ?? WAVEFORM_SIZE_DEFAULT,
    timerAfterMedia: q.timerAfterMedia ?? false,
    pointsMode: q.pointsMode as FormValues['pointsMode'],
    scoring: (q.scoring ?? 'standard') as Scoring,
    numericValue: q.numericValue ? Number(q.numericValue) : 0,
    numericTolerance: q.numericTolerance ? Number(q.numericTolerance) : 0,
    multiSelect: q.multiSelect ?? false,
    options: q.options.map((o, i) => ({
      key: o.id,
      text: o.text ?? '',
      color: o.color,
      shape: o.shape,
      isCorrect: o.isCorrect,
      correctOrderIndex: o.correctOrderIndex ?? i,
      mediaId: o.mediaId ?? null,
      alt: o.alt ?? '',
    })),
    acceptedAnswers: q.acceptedAnswers.map((a) => ({ text: a.text })),
  };
}

export function QuestionForm({
  quizId,
  question,
  mediaTailS = MEDIA_TAIL_DEFAULT_S,
  onClose,
  onDirtyChange,
}: {
  quizId: string;
  question?: QuizDetailDtoQuestionsItem;
  /** The quiz's pause after a media: a longer media stretches the question's time. */
  mediaTailS?: number;
  onClose: () => void;
  /** Reports unsaved edits so the parent can guard against losing them. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation(['editor', 'common']);
  const queryClient = useQueryClient();
  const add = useQuestionsControllerAdd();
  const update = useQuestionsControllerUpdate();
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showImageErrors, setShowImageErrors] = useState(false);
  // Computed once: option keys are generated, so a fresh copy per render would reset the form.
  const [initial] = useState(() => initialValues(question));
  // Draft kept in localStorage until saved or discarded (survives reload / closed tab).
  const draftKey = `quiz:${quizId}:question:${question?.id ?? 'new'}`;
  // A draft saved before the media slots existed has no `media`: it is not restored.
  const [restored, setRestored] = useState(() => {
    const draft = loadDraft<FormValues>(draftKey);
    return draft && 'media' in draft ? withDefaults(draft) : null;
  });

  const form = useForm({
    defaultValues: restored ?? initial,
    onSubmit: async ({ value }) => {
      setError(null);
      // The contract's rule, before the server says it: never a video with a sound.
      const media = questionMediaSchema.safeParse(value.media);
      if (!media.success) {
        const coded = media.error.issues.find((i) => i.message.startsWith('media.'));
        setError(errorText(coded?.message ?? 'media.invalid'));
        return;
      }
      // An image choice answer needs its picture and its text: pointed out, not sent.
      if (value.type === 'image_choice' && !value.options.every(imageOptionComplete)) {
        setShowImageErrors(true);
        setError(t('questionForm.imagesIncomplete'));
        return;
      }
      const data = buildPayload(value);
      try {
        if (question) {
          await update.mutateAsync({ qid: question.id, data });
        } else {
          await add.mutateAsync({ id: quizId, data });
        }
        await queryClient.invalidateQueries({
          queryKey: getQuizzesControllerGetQueryKey(quizId),
        });
        clearDraft(draftKey);
        onClose();
      } catch (err) {
        setError(apiErrorText(err, t('questionForm.invalidError')));
      }
    },
  });
  const values = useStore(form.store, (s) => s.values);
  useEffect(() => {
    if (JSON.stringify(values) === JSON.stringify(initial)) clearDraft(draftKey);
    else saveDraft(draftKey, values);
  }, [values, initial, draftKey]);
  const discardDraft = () => {
    clearDraft(draftKey);
    setRestored(null);
    form.reset(initial);
  };

  const type = useStore(form.store, (s) => s.values.type);
  // Dirty = values differ from what was loaded (a fresh question is dirty as soon as typed in).
  const dirty = useStore(form.store, (s) => JSON.stringify(s.values) !== JSON.stringify(initial));
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);
  const cancel = () => (dirty ? setConfirmDiscard(true) : onClose());
  const media = useStore(form.store, (s) => s.values.media);
  const timeLimitS = useStore(form.store, (s) => s.values.timeLimitS);
  const mediaMs = useMediaDurationMs(media);
  // What the session will really give this question (the server computes the same).
  const listenFirst = useStore(form.store, (s) => s.values.timerAfterMedia);
  // Read on the folded lines (playback, points).
  const audioTarget = useStore(form.store, (s) => s.values.audioTarget);
  const waveformSize = useStore(form.store, (s) => s.values.waveformSize);
  const pointsMode = useStore(form.store, (s) => s.values.pointsMode);
  const scoring = useStore(form.store, (s) => s.values.scoring);
  const multiSelect = useStore(form.store, (s) => s.values.multiSelect);
  const scorings = scoringsFor(type, multiSelect);
  const canListenFirst = mediaHasSound(media) && mediaMs !== null;
  const stretchedS =
    canListenFirst && listenFirst
      ? timeLimitS
      : effectiveTimeLimitS(timeLimitS, mediaMs, mediaTailS, READ_DELAY_DEFAULT_MS);
  const options = useStore(form.store, (s) => s.values.options);
  // Index of the option whose removal awaits confirmation.
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const answers = useStore(form.store, (s) => s.values.acceptedAnswers);

  // Colour and shape are a pair fixed by position (red ▲, blue ◆, yellow ●, green ■):
  // nothing to choose, and removing an option re-flows the ones after it.
  const setOptions = (next: OptionValue[]) =>
    form.setFieldValue(
      'options',
      next.map((o, i) => ({
        ...o,
        color: COLORS[i % COLORS.length],
        shape: SHAPES[i % SHAPES.length],
      })),
    );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onOptionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = options.findIndex((o) => o.key === active.id);
    const to = options.findIndex((o) => o.key === over.id);
    if (from >= 0 && to >= 0) setOptions(arrayMove(options, from, to));
  };

  const onTypeChange = (next: QType) => {
    const wasImages = type === 'image_choice';
    form.setFieldValue('type', next);
    if (next === 'image_choice' || wasImages) {
      // Text answers make no pictures, and pictures no text: both start afresh.
      if (next !== 'image_choice') form.setFieldValue('multiSelect', false);
      else form.setFieldValue('media', { visual: null, audio: media.audio } as QuestionMedia);
      setShowImageErrors(false);
      setOptions(
        next === 'true_false'
          ? [
              newOption(0, t('questionForm.trueOption')),
              newOption(1, t('questionForm.falseOption')),
            ]
          : OPTION_TYPES.includes(next)
            ? [newOption(0), newOption(1)]
            : options,
      );
    } else if (next === 'true_false') {
      setOptions([
        newOption(0, t('questionForm.trueOption')),
        newOption(1, t('questionForm.falseOption')),
      ]);
    } else if (OPTION_TYPES.includes(next) && options.length < 2) {
      setOptions([newOption(0), newOption(1)]);
    }
  };

  const setCorrect = (index: number, checked: boolean) => {
    setOptions(
      options.map((o, i) => ({
        ...o,
        isCorrect:
          SINGLE_CORRECT.includes(type) || (type === 'image_choice' && !multiSelect)
            ? i === index
            : i === index
              ? checked
              : o.isCorrect,
      })),
    );
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      {/* Enregistrer est en haut, collant : une question longue (propositions,
          explication, arrière-plan) mettait le bouton hors d'atteinte, et on ne
          devrait jamais avoir à chercher comment garder ce qu'on vient d'écrire. */}
      <div className="bg-background/95 sticky top-0 z-20 -mx-1 flex items-center gap-2 px-1 py-2 backdrop-blur">
        {/* Hors tiroir, le formulaire n'a pas de titre : la barre dit ce qu'on édite. */}
        <span className="mr-auto min-w-0 truncate text-base font-semibold">
          {question ? t('questionForm.titleEdit') : t('questionForm.titleAdd')}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || add.isPending || update.isPending}>
          {question ? t('questionForm.submitUpdate') : t('questionForm.submitAdd')}
        </Button>
      </div>

      {restored ? <DraftNotice onDiscard={discardDraft} /> : null}
      <Label>
        {t('questionForm.typeLabel')}
        <Select value={type} onChange={(e) => onTypeChange(e.target.value as QType)}>
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`questionType.${value}`)}
            </option>
          ))}
        </Select>
      </Label>
      {/* What this type does on screen and how it scores — the rules are not obvious. */}
      <p className="text-muted-foreground -mt-3 text-xs leading-snug">
        {t(`questionTypeHelp.${type}`)}
      </p>

      <form.Field name="prompt">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium leading-none">
              {t('questionForm.promptLabel')}
            </span>
            <MarkdownEditor
              aria-label={t('questionForm.promptLabel')}
              value={field.state.value}
              onChange={field.handleChange}
              placeholder={t('questionForm.promptPlaceholder')}
            />
            {type === 'image_choice' ? null : (
              <PromptImageNotice
                prompt={field.state.value}
                media={media}
                onMove={(rest, next) => {
                  field.handleChange(rest);
                  form.setFieldValue('media', next);
                }}
              />
            )}
          </div>
        )}
      </form.Field>

      {/* Les médias, repliés en un seul bloc ; écouter d'abord et la lecture ferment le
          groupe du son. */}
      <QuestionMediaField
        value={media}
        onChange={(m) => form.setFieldValue('media', m)}
        withVisual={type !== 'image_choice'}
      >
        {canListenFirst ? (
          <form.Field name="timerAfterMedia">
            {(field) => (
              <label
                className="flex items-start gap-2 text-sm"
                title={t('questionForm.listenFirstHint')}
              >
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5"
                  checked={field.state.value}
                  onChange={(e) => field.handleChange(e.target.checked)}
                />
                <span>
                  <span className="font-medium">{t('questionForm.listenFirstLabel')}</span>
                  <span className="text-muted-foreground block">
                    {t('questionForm.listenFirstHint')}
                  </span>
                </span>
              </label>
            )}
          </form.Field>
        ) : null}
        {mediaHasSound(media) ? (
          <Disclosure
            title={t('questionForm.playbackLegend')}
            value={[
              audioTarget
                ? t(`settings.audioTarget.${audioTarget}`)
                : t('questionForm.audioTargetDefault'),
              media.audio ? t(`questionForm.waveformSize.${waveformSize}`) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <form.Field name="audioTarget">
              {(field) => (
                <Label title={t('questionForm.audioTargetHint')}>
                  {t('questionForm.audioTargetLabel')}
                  <Select
                    value={field.state.value ?? ''}
                    onChange={(e) =>
                      field.handleChange(
                        e.target.value === '' ? null : (e.target.value as AudioTarget),
                      )
                    }
                  >
                    <option value="">{t('questionForm.audioTargetDefault')}</option>
                    {AUDIO_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {t(`settings.audioTarget.${target}`)}
                      </option>
                    ))}
                  </Select>
                </Label>
              )}
            </form.Field>
            {media.audio ? (
              <form.Field name="waveformSize">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label title={t('questionForm.waveformSizeHint')}>
                      {t('questionForm.waveformSizeLabel')}
                      <Select
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value as WaveformSize)}
                      >
                        {WAVEFORM_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {t(`questionForm.waveformSize.${size}`)}
                          </option>
                        ))}
                      </Select>
                    </Label>
                    {/* As the screens will draw it, at their type size — or, hidden,
                        the one place it still shows (faded, with why). */}
                    {field.state.value === 'hidden' ? (
                      <p className="text-muted-foreground text-xs">
                        {t('questionForm.waveformHiddenNote')}
                      </p>
                    ) : null}
                    <Waveform
                      peaks={media.audio?.peaks ?? []}
                      progress={0}
                      size={field.state.value}
                      className={cn('text-base', field.state.value === 'hidden' && 'opacity-40')}
                      label={t('questionForm.waveformPreview')}
                    />
                  </div>
                )}
              </form.Field>
            ) : null}
          </Disclosure>
        ) : null}
      </QuestionMediaField>

      {/* Le temps reste en vue : c'est ce qu'on règle le plus, et la note qui
          l'explique (média plus long, écoute d'abord) le suit. */}
      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>{t('questionForm.timingLegend')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <form.Field name="timeLimitS">
            {(field) => (
              <Label>
                {t('questionForm.timeLimitLabel')}
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="revealDelayS">
            {(field) => (
              <Label title={t('questionForm.revealDelayHint')}>
                {t('questionForm.revealDelayLabel')}
                <Input
                  type="number"
                  min={1}
                  max={300}
                  placeholder={t('questionForm.revealDelayPlaceholder')}
                  value={field.state.value ?? ''}
                  onChange={(e) =>
                    field.handleChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Label>
            )}
          </form.Field>
        </div>
        {canListenFirst && listenFirst ? (
          <p className="text-muted-foreground text-sm" role="note">
            {t('questionForm.listenFirstTime', {
              media: Math.ceil((mediaMs ?? 0) / 1000),
              time: timeLimitS,
            })}
          </p>
        ) : stretchedS > timeLimitS ? (
          <p className="text-muted-foreground text-sm" role="note">
            {t('questionForm.stretchedTime', {
              media: Math.ceil((mediaMs ?? 0) / 1000),
              total: stretchedS,
              tail: mediaTailS,
            })}
          </p>
        ) : null}
      </fieldset>

      {type === 'image_choice' && (
        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND}>{t('questionForm.imagesLegend')}</legend>
          <ImageChoiceOptions
            options={options}
            currentOptions={() => form.getFieldValue('options')}
            multiSelect={multiSelect}
            showErrors={showImageErrors}
            sensors={sensors}
            setOptions={setOptions}
            newOption={newOption}
            onCorrect={setCorrect}
            onMultiSelect={(multi) => {
              form.setFieldValue('multiSelect', multi);
              // Back to one right picture: the first one ticked stays.
              if (!multi) {
                const first = options.findIndex((o) => o.isCorrect);
                setOptions(options.map((o, i) => ({ ...o, isCorrect: i === first })));
              }
            }}
          />
        </fieldset>
      )}

      {OPTION_TYPES.includes(type) && type !== 'image_choice' && (
        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND}>{t('questionForm.optionsLegend')}</legend>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onOptionDragEnd}
          >
            <SortableContext
              items={options.map((o) => o.key)}
              strategy={verticalListSortingStrategy}
            >
              {options.map((opt, i) => (
                <SortableOption key={opt.key} id={opt.key}>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-md text-lg text-white',
                      COLOR_BG[opt.color] ?? OPTION_BG_FALLBACK,
                    )}
                  >
                    <ShapeIcon shape={opt.shape} />
                  </span>
                  <MarkdownEditor
                    profile="inline"
                    aria-label={t('questionForm.optionAriaLabel', { index: i + 1 })}
                    className="min-w-48 flex-1"
                    value={opt.text}
                    onChange={(text) =>
                      setOptions(options.map((o, idx) => (idx === i ? { ...o, text } : o)))
                    }
                    placeholder={t('questionForm.optionPlaceholder', { index: i + 1 })}
                  />

                  {type === 'ordering' ? (
                    <Input
                      type="number"
                      aria-label={t('questionForm.orderAriaLabel', { index: i + 1 })}
                      min={0}
                      className="w-20"
                      value={opt.correctOrderIndex}
                      onChange={(e) =>
                        setOptions(
                          options.map((o, idx) =>
                            idx === i ? { ...o, correctOrderIndex: Number(e.target.value) } : o,
                          ),
                        )
                      }
                    />
                  ) : type === 'poll' ? null : (
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type={SINGLE_CORRECT.includes(type) ? 'radio' : 'checkbox'}
                        name="correct"
                        checked={opt.isCorrect}
                        onChange={(e) => setCorrect(i, e.target.checked)}
                      />
                      {t('questionForm.correct')}
                    </label>
                  )}

                  {type !== 'true_false' && options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t('questionForm.removeOption', { index: i + 1 })}
                      onClick={() =>
                        // An empty option goes without asking; a typed one is worth a confirmation.
                        (opt.text ?? '').trim()
                          ? setPendingRemoval(i)
                          : setOptions(options.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </SortableOption>
              ))}
            </SortableContext>
          </DndContext>
          {type !== 'true_false' && options.length < COLORS.length && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setOptions([...options, newOption(options.length)])}
            >
              <Plus className="size-4" />
              {t('questionForm.addOption')}
            </Button>
          )}
        </fieldset>
      )}

      {type === 'text_input' && (
        <fieldset className="flex flex-col gap-2">
          <legend className={LEGEND}>{t('questionForm.acceptedAnswersLegend')}</legend>
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={t('questionForm.answerAriaLabel', { index: i + 1 })}
                value={a.text}
                onChange={(e) =>
                  form.setFieldValue(
                    'acceptedAnswers',
                    answers.map((x, idx) => (idx === i ? { text: e.target.value } : x)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('questionForm.removeAnswer', { index: i + 1 })}
                onClick={() =>
                  form.setFieldValue(
                    'acceptedAnswers',
                    answers.filter((_, idx) => idx !== i),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => form.setFieldValue('acceptedAnswers', [...answers, { text: '' }])}
          >
            <Plus className="size-4" />
            {t('questionForm.addAnswer')}
          </Button>
        </fieldset>
      )}

      {type === 'numeric' && (
        <div className="flex flex-wrap gap-4">
          <form.Field name="numericValue">
            {(field) => (
              <Label>
                {t('questionForm.numericValueLabel')}
                <Input
                  type="number"
                  className="w-32"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="numericTolerance">
            {(field) => (
              <Label>
                {t('questionForm.numericToleranceLabel')}
                <Input
                  type="number"
                  min={0}
                  className="w-32"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                />
              </Label>
            )}
          </form.Field>
        </div>
      )}

      {/* Le barème par défaut convient presque toujours : il se lit replié. */}
      {type !== 'poll' && (
        <Disclosure
          title={t('questionForm.pointsLegend')}
          value={[
            t(`questionForm.pointsMode.${pointsMode}`, { defaultValue: pointsMode }),
            scorings.length > 0
              ? t(
                  `questionForm.scoring.${type}.${scorings.includes(scoring) ? scoring : 'standard'}`,
                )
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <form.Field name="pointsMode">
              {(field) => (
                <Label>
                  {t('questionForm.pointsLabel')}
                  <Select
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value as FormValues['pointsMode'])}
                  >
                    <option value="standard">{t('questionForm.pointsMode.standard')}</option>
                    <option value="double">{t('questionForm.pointsMode.double')}</option>
                    <option value="fixed">{t('questionForm.pointsMode.fixed')}</option>
                  </Select>
                </Label>
              )}
            </form.Field>
            {scorings.length > 0 && (
              <form.Field name="scoring">
                {(field) => (
                  <Label title={t(`questionForm.scoringHelp.${type}`)}>
                    {t('questionForm.scoringLabel')}
                    <Select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value as Scoring)}
                    >
                      <option value="standard">{t(`questionForm.scoring.${type}.standard`)}</option>
                      {scorings.map((v) => (
                        <option key={v} value={v}>
                          {t(`questionForm.scoring.${type}.${v}`)}
                        </option>
                      ))}
                    </Select>
                  </Label>
                )}
              </form.Field>
            )}
          </div>
        </Disclosure>
      )}

      {/* Facultative : repliée, comme tout ce qui est secondaire. */}
      {type !== 'poll' && (
        <form.Field name="answerExplanation">
          {(field) => (
            <Disclosure title={t('questionForm.answerExplanationLabel')}>
              <MarkdownEditor
                aria-label={t('questionForm.answerExplanationLabel')}
                value={field.state.value}
                onChange={field.handleChange}
                placeholder={t('questionForm.answerExplanationPlaceholder')}
              />
            </Disclosure>
          )}
        </form.Field>
      )}

      <form.Field name="background">
        {(field) => <BackgroundField value={field.state.value} onChange={field.handleChange} />}
      </form.Field>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <ConfirmDialog
        open={pendingRemoval !== null}
        destructive
        title={t('questionForm.removeOptionConfirm.title')}
        description={t('questionForm.removeOptionConfirm.description', {
          label:
            pendingRemoval !== null
              ? options[pendingRemoval]?.text || `#${pendingRemoval + 1}`
              : '',
        })}
        confirmLabel={t('questionForm.removeOptionConfirm.confirmLabel')}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval !== null)
            setOptions(options.filter((_, idx) => idx !== pendingRemoval));
          setPendingRemoval(null);
        }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        destructive
        title={t('discardConfirm.title')}
        description={t('discardConfirm.description')}
        confirmLabel={t('discardConfirm.confirmLabel')}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          clearDraft(draftKey);
          onClose();
        }}
      />
    </form>
  );
}

/** A draft saved before the image choice: its answers get no picture, it gets one right answer. */
function withDefaults(draft: FormValues): FormValues {
  return {
    ...draft,
    multiSelect: draft.multiSelect ?? false,
    options: draft.options.map((o) => ({ ...o, mediaId: o.mediaId ?? null, alt: o.alt ?? '' })),
  };
}

/** Legend of a primary section of the form; secondary groups fold in a `Disclosure`. */
const LEGEND = 'text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase';

/** Whether the media play a sound: an MP3, or a video's own track. */
function mediaHasSound(media: QuestionMedia): boolean {
  return !!media.audio || media.visual?.kind === 'video';
}

/** The engine's default reading window before answers open (GAME_READ_DELAY_MS), for the hint. */
const READ_DELAY_DEFAULT_MS = 3000;

/** Construit le payload API en n'envoyant que les champs pertinents pour le type. */
function buildPayload(v: FormValues) {
  const base = {
    type: v.type,
    prompt: v.prompt,
    timeLimitS: v.timeLimitS,
    revealDelayS: v.revealDelayS,
    // Nothing to hear, nothing to target: a removed sound takes its setting with it.
    audioTarget: mediaHasSound(v.media) ? v.audioTarget : null,
    waveformSize: v.waveformSize,
    // Only with a media to wait for; the server also falls back when its length is unknown.
    timerAfterMedia: mediaHasSound(v.media) && v.timerAfterMedia,
    pointsMode: v.type === 'poll' ? ('none' as const) : v.pointsMode,
    scoring: scoringsFor(v.type, v.multiSelect).includes(v.scoring)
      ? v.scoring
      : ('standard' as const),
    media: v.media,
    answerExplanation: v.answerExplanation.trim() || null,
    backgroundMediaId: v.background.mediaId,
    backgroundGradient: v.background.gradient,
    textTone: v.background.textTone,
    textOutline: v.background.textOutline,
  };
  if (v.type === 'image_choice') {
    return {
      ...base,
      // The answers are the pictures: no visual of the question's own.
      media: { visual: null, audio: v.media.audio } as QuestionMedia,
      multiSelect: v.multiSelect,
      options: v.options.map((o) => ({
        mediaId: o.mediaId ?? undefined,
        alt: o.alt.trim(),
        color: o.color as (typeof COLORS)[number],
        shape: o.shape as (typeof SHAPES)[number],
        isCorrect: o.isCorrect,
      })),
    };
  }
  if (OPTION_TYPES.includes(v.type)) {
    return {
      ...base,
      options: v.options.map((o) => ({
        text: o.text || undefined,
        // A picture an answer already holds (an imported quiz) is kept, not lost on save.
        mediaId: o.mediaId ?? undefined,
        color: o.color as (typeof COLORS)[number],
        shape: o.shape as (typeof SHAPES)[number],
        isCorrect: o.isCorrect,
        correctOrderIndex: v.type === 'ordering' ? o.correctOrderIndex : undefined,
      })),
    };
  }
  if (v.type === 'text_input') {
    return {
      ...base,
      acceptedAnswers: v.acceptedAnswers
        .filter((a) => a.text.trim())
        .map((a) => ({ text: a.text })),
    };
  }
  if (v.type === 'numeric') {
    return {
      ...base,
      numericValue: v.numericValue,
      numericTolerance: v.numericTolerance,
    };
  }
  return base;
}

/** Sortable option row: grip handle on the left, keyboard-sortable too. */
function SortableOption({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation('editor');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md',
        isDragging && 'bg-background relative z-10 shadow-md',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t('questionForm.dragOption')}
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none rounded p-1 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}

/**
 * An image written in the prompt (images are no longer added there, one already
 * there still shows): while the question has no visual, the editor offers to move
 * it to the question's media — framed on every screen, zoomable on the phones and
 * fetched ahead. The author decides, sees the result, and can cancel before saving.
 */
function PromptImageNotice({
  prompt,
  media,
  onMove,
}: {
  prompt: string;
  media: QuestionMedia;
  onMove: (rest: string, media: QuestionMedia) => void;
}) {
  const { t } = useTranslation('editor');
  const found = media.visual ? null : promptImage(prompt);
  if (!found) return null;
  const move = () => {
    onMove(found.rest, {
      visual: { kind: 'image', assetId: found.mediaId },
      audio: media.audio,
    } as QuestionMedia);
    // Its description travels with it, when the media has none yet.
    if (found.alt.trim()) {
      void mediaControllerDescribe(found.mediaId)
        .then((res) =>
          res.data.alt ? null : mediaControllerSetAlt(found.mediaId, { alt: found.alt.trim() }),
        )
        .catch(() => undefined);
    }
  };
  return (
    <div
      role="note"
      className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <ImageIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t('questionForm.promptImageNotice')}</span>
      <Button type="button" size="sm" variant="outline" onClick={move}>
        {t('questionForm.promptImageMove')}
      </Button>
    </div>
  );
}
