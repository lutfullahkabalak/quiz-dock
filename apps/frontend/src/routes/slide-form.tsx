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
import type {
  AudioTarget,
  WaveformSize,
  SlideBlock,
  SlideColumnsRatio,
  SlideGradient,
  SlideLeafBlock,
  SlideTextAlign,
  SlideTextSize,
  SlideTextTone,
} from '@quiz-dock/contracts';
import { SLIDE_VARIABLES, type quizVariables } from '@quiz-dock/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Columns2,
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Plus,
  Text,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkdownEditor } from '@/components/markdown-editor';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { clearDraft, loadDraft, saveDraft } from '@/lib/draft-store';
import { DraftNotice } from '@/components/draft-notice';
import { apiErrorText } from '../api/http';
import type { QuizDetailDtoSlidesItem } from '../api/generated/model';
import { getQuizzesControllerGetQueryKey } from '../api/generated/quizzes/quizzes';
import { useSlidesControllerAdd, useSlidesControllerUpdate } from '../api/generated/slides/slides';
import { columnsTemplate } from '../game/live-components';
import { SlideStage } from '../game/slide-stage';
import { BackgroundField } from './background-field';
import { MediaUpload } from './media-upload';
import { SlideMediaField, type SlideMediaValue } from './slide-media-field';
import { mediaUrl } from '@/lib/media-url';
import { slideShowOf } from './quiz-stage-preview';
import { Segmented } from '@/components/ui/segmented';

interface FormValues extends SlideMediaValue {
  blocks: SlideBlock[];
  mediaId: string | null;
  gradient: SlideGradient | null;
  textTone: SlideTextTone;
  textOutline: boolean;
  displayDelayS: number | null;
}

let blockSeq = 0;
const blockId = () => `b-${Date.now().toString(36)}-${++blockSeq}`;

function initialValues(s?: QuizDetailDtoSlidesItem): FormValues {
  return {
    blocks: (s?.blocks as SlideBlock[] | undefined) ?? [
      { type: 'heading', id: blockId(), text: '', level: 1 },
    ],
    mediaId: s?.mediaId ?? null,
    gradient: (s?.gradient as SlideGradient | null | undefined) ?? null,
    videoMediaId: s?.videoMediaId ?? null,
    videoLoop: s?.videoLoop ?? true,
    videoSound: s?.videoSound ?? true,
    audioMediaId: s?.audioMediaId ?? null,
    waveformSize: (s?.waveformSize as WaveformSize | undefined) ?? 'hidden',
    audioTarget: (s?.audioTarget as AudioTarget | null | undefined) ?? null,
    textTone: (s?.textTone as SlideTextTone | undefined) ?? 'light',
    textOutline: s?.textOutline ?? true,
    displayDelayS: s?.displayDelayS ?? null,
  };
}

type LeafKind = SlideLeafBlock['type'];

function newLeaf(kind: LeafKind, level: 1 | 2 = 1): SlideLeafBlock {
  const id = blockId();
  if (kind === 'heading') return { type: 'heading', id, text: '', level };
  if (kind === 'text') return { type: 'text', id, md: '' };
  return { type: 'image', id, mediaId: '', size: 'large', align: 'center' };
}

/** Blocks the API would refuse (empty heading/text, image without media) are dropped on save. */
function complete(blocks: SlideBlock[]): SlideBlock[] {
  const leafOk = (b: SlideLeafBlock) =>
    b.type === 'heading'
      ? b.text.trim() !== ''
      : b.type === 'text'
        ? b.md.trim() !== ''
        : b.mediaId !== '';
  return blocks.flatMap((b): SlideBlock[] => {
    if (b.type !== 'columns') return leafOk(b) ? [b] : [];
    const columns = b.columns.map((c) => c.filter(leafOk));
    return columns.some((c) => c.length > 0) ? [{ ...b, columns }] : [];
  });
}

/**
 * Slide composer (#7): a stack of blocks (heading, text, image, columns) that is
 * reordered by drag and drop, over an optional full-cover background, with a
 * faithful 16:9 stage of the result.
 */
export function SlideForm({
  quizId,
  slide,
  quizFields,
  onClose,
  onDirtyChange,
}: {
  quizId: string;
  slide?: QuizDetailDtoSlidesItem;
  /** The quiz's fields its variables read in the preview; the room's stay as written. */
  quizFields?: Parameters<typeof quizVariables>[0];
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation(['editor', 'common']);
  const queryClient = useQueryClient();
  const add = useSlidesControllerAdd();
  const update = useSlidesControllerUpdate();
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showStage, setShowStage] = useState(() => {
    try {
      return localStorage.getItem('slide.preview') !== 'hidden';
    } catch {
      return true;
    }
  });
  const toggleStage = () => {
    const next = !showStage;
    setShowStage(next);
    try {
      localStorage.setItem('slide.preview', next ? 'shown' : 'hidden');
    } catch {
      /* storage unavailable: the choice just does not persist */
    }
  };
  const [initial] = useState(() => initialValues(slide));
  // Draft kept in localStorage until saved or discarded (survives reload / closed tab).
  const draftKey = `quiz:${quizId}:slide:${slide?.id ?? 'new'}`;
  const [restored, setRestored] = useState(() => loadDraft<FormValues>(draftKey));
  const [values, setValues] = useState<FormValues>(restored ?? initial);
  useEffect(() => {
    if (JSON.stringify(values) === JSON.stringify(initial)) clearDraft(draftKey);
    else saveDraft(draftKey, values);
  }, [values, initial, draftKey]);
  const discardDraft = () => {
    clearDraft(draftKey);
    setRestored(null);
    setValues(initial);
  };
  const patch = (p: Partial<FormValues>) => setValues((v) => ({ ...v, ...p }));
  // The sound's waveform, known once a sound is picked here (the size preview draws it).
  const [audioPeaks, setAudioPeaks] = useState<number[] | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);
  const cancel = () => (dirty ? setConfirmDiscard(true) : onClose());

  const submit = async () => {
    setError(null);
    const data = {
      blocks: complete(values.blocks),
      mediaId: values.mediaId,
      gradient: values.gradient,
      videoMediaId: values.videoMediaId,
      videoLoop: values.videoLoop,
      videoSound: values.videoSound,
      audioMediaId: values.videoMediaId && values.videoSound ? null : values.audioMediaId,
      waveformSize: values.waveformSize,
      audioTarget: values.audioTarget,
      textTone: values.textTone,
      textOutline: values.textOutline,
      displayDelayS: values.displayDelayS,
    };
    try {
      if (slide) await update.mutateAsync({ sid: slide.id, data });
      else await add.mutateAsync({ id: quizId, data });
      await queryClient.invalidateQueries({ queryKey: getQuizzesControllerGetQueryKey(quizId) });
      clearDraft(draftKey);
      onClose();
    } catch (err) {
      setError(apiErrorText(err, t('slideForm.invalidError')));
    }
  };

  // ── blocks ──
  const setBlock = (id: string, next: SlideBlock) =>
    patch({ blocks: values.blocks.map((b) => (b.id === id ? next : b)) });
  const removeBlock = (id: string) => patch({ blocks: values.blocks.filter((b) => b.id !== id) });
  const addBlock = (b: SlideBlock) => patch({ blocks: [...values.blocks, b] });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = values.blocks.findIndex((b) => b.id === active.id);
    const to = values.blocks.findIndex((b) => b.id === over.id);
    if (from >= 0 && to >= 0) patch({ blocks: arrayMove(values.blocks, from, to) });
  };

  const stage = {
    ...slideShowOf(values, 0, quizFields),
    // Its media, shown still (#125): the video's first frame, the sound's waveform when known.
    audio:
      values.audioMediaId && audioPeaks && !(values.videoMediaId && values.videoSound)
        ? {
            url: mediaUrl(values.audioMediaId),
            durationMs: 0,
            peaks: audioPeaks,
            gainDb: 0,
            size: values.waveformSize,
          }
        : null,
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* Enregistrer est en haut, collant, comme pour une question : l'aperçu, les
          blocs et le média poussent le bas de la page hors d'atteinte. La barre dit
          aussi ce qu'on édite — hors tiroir, le formulaire n'a pas de titre. */}
      <div className="bg-background/95 sticky top-0 z-20 -mx-1 flex items-center gap-2 px-1 py-2 backdrop-blur">
        <span className="min-w-0 truncate text-base font-semibold">
          {slide ? t('slideForm.titleEdit') : t('slideForm.titleAdd')}
        </span>
        {/* Le refus d'enregistrer se lit à côté du bouton qui l'a provoqué, pas en
            bas de page où plus personne ne regarde. */}
        <p className="text-destructive mr-auto min-w-0 flex-1 truncate text-xs">{error}</p>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || add.isPending || update.isPending}>
          {slide ? t('slideForm.submitUpdate') : t('slideForm.submitAdd')}
        </Button>
      </div>

      {restored ? <DraftNotice onDiscard={discardDraft} /> : null}
      {/* What the projected screen will show, at slide proportions — foldable, remembered. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('slideForm.previewLegend')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-pressed={showStage}
            onClick={toggleStage}
          >
            {showStage ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showStage ? t('slideForm.hidePreview') : t('slideForm.showPreview')}
          </Button>
        </div>
        {showStage ? <SlideStage className="rounded-xl border" slide={stage} /> : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
          {t('slideForm.blocksLegend')}
        </legend>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={values.blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {values.blocks.map((b) => (
              <SortableBlock key={b.id} id={b.id} onRemove={() => removeBlock(b.id)}>
                <BlockEditor block={b} onChange={(next) => setBlock(b.id, next)} />
              </SortableBlock>
            ))}
          </SortableContext>
        </DndContext>
        <AddBlockBar onAdd={addBlock} />
        <VariablesHelp />
      </fieldset>

      <SlideMediaField
        value={values}
        onChange={(p) => patch(p)}
        peaks={audioPeaks}
        onPeaks={setAudioPeaks}
      />

      <BackgroundField
        value={{
          mediaId: values.mediaId,
          gradient: values.gradient,
          textTone: values.textTone,
          textOutline: values.textOutline,
        }}
        onChange={(b) => patch(b)}
      />

      <DisplayTimeField
        value={values.displayDelayS}
        onChange={(v) => patch({ displayDelayS: v })}
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

/**
 * The variables a heading or a text may hold, each with what it becomes: the
 * quiz's are shown filled in the preview, the room's once the quiz is played.
 */
function VariablesHelp() {
  const { t } = useTranslation('editor');
  return (
    <Disclosure title={t('slideForm.variablesLegend')} value={`{${SLIDE_VARIABLES[0]}} …`}>
      <p className="text-muted-foreground text-xs">{t('slideForm.variablesHint')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {SLIDE_VARIABLES.map((name) => (
          <div key={name} className="contents">
            <dt>
              <code className="bg-muted rounded px-1">{`{${name}}`}</code>
            </dt>
            <dd className="text-muted-foreground">{t(`slideForm.variables.${name}`)}</dd>
          </div>
        ))}
      </dl>
    </Disclosure>
  );
}

/** Auto-mode display time: null = engine default, 0 = manual override, N = custom seconds. */
function DisplayTimeField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation('editor');
  const mode = value === null ? 'default' : value === 0 ? 'manual' : 'custom';
  return (
    <Disclosure
      title={t('slideForm.displayLegend')}
      value={mode === 'custom' ? `${value} s` : t(`slideForm.display.${mode}`)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t('slideForm.displayLegend')}
          className="w-56"
          value={mode}
          onChange={(e) =>
            onChange(e.target.value === 'default' ? null : e.target.value === 'manual' ? 0 : 10)
          }
        >
          <option value="default">{t('slideForm.display.default')}</option>
          <option value="manual">{t('slideForm.display.manual')}</option>
          <option value="custom">{t('slideForm.display.custom')}</option>
        </Select>
        {mode === 'custom' ? (
          <Input
            type="number"
            aria-label={t('slideForm.displayDelayLabel')}
            min={1}
            max={600}
            className="w-24"
            value={value ?? ''}
            onChange={(e) => onChange(Math.min(600, Math.max(1, Number(e.target.value) || 1)))}
          />
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">{t('slideForm.displayHint')}</p>
    </Disclosure>
  );
}

/** Buttons to append a block of each kind. */
function AddBlockBar({ onAdd }: { onAdd: (b: SlideBlock) => void }) {
  const { t } = useTranslation('editor');
  const btn = (label: string, icon: ReactNode, make: () => SlideBlock) => (
    <Button type="button" variant="outline" size="sm" onClick={() => onAdd(make())}>
      {icon}
      {label}
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Plus className="text-muted-foreground size-4" />
      {btn(t('slideForm.block.heading'), <Heading1 className="size-4" />, () => newLeaf('heading'))}
      {btn(t('slideForm.block.subheading'), <Heading2 className="size-4" />, () =>
        newLeaf('heading', 2),
      )}
      {btn(t('slideForm.block.text'), <Text className="size-4" />, () => newLeaf('text'))}
      {btn(t('slideForm.block.image'), <ImageIcon className="size-4" />, () => newLeaf('image'))}
      {btn(t('slideForm.block.columns2'), <Columns2 className="size-4" />, () => ({
        type: 'columns',
        id: blockId(),
        columns: [[newLeaf('text')], [newLeaf('image')]],
      }))}
      {btn(t('slideForm.block.columns3'), <Columns3 className="size-4" />, () => ({
        type: 'columns',
        id: blockId(),
        columns: [[newLeaf('text')], [newLeaf('text')], [newLeaf('text')]],
      }))}
    </div>
  );
}

/** Sortable wrapper: grip handle, remove button, the block editor in between. */
function SortableBlock({
  id,
  onRemove,
  children,
}: {
  id: string;
  onRemove: () => void;
  children: ReactNode;
}) {
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
        'bg-background flex items-start gap-2 rounded-lg border p-2',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t('slideForm.dragBlock')}
        className="text-muted-foreground hover:text-foreground mt-2 cursor-grab touch-none rounded p-1 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-1 size-7"
        aria-label={t('slideForm.removeBlock')}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

/** One block's fields; a `columns` block nests leaf editors per column. */
function BlockEditor({
  block,
  onChange,
}: {
  block: SlideBlock;
  onChange: (next: SlideBlock) => void;
}) {
  const { t } = useTranslation('editor');
  if (block.type !== 'columns') return <LeafEditor block={block} onChange={onChange} />;
  const setCol = (i: number, col: SlideLeafBlock[]) =>
    onChange({ ...block, columns: block.columns.map((c, idx) => (idx === i ? col : c)) });
  return (
    <div className="flex flex-col gap-2">
      {block.columns.length === 2 ? (
        <Segmented
          size="sm"
          className="w-fit"
          label={t('slideForm.ratio')}
          value={block.ratio ?? '1-1'}
          onChange={(ratio) => onChange({ ...block, ratio })}
          options={(['1-1', '1-2', '2-1'] as SlideColumnsRatio[]).map((r) => ({
            value: r,
            label: r.replace('-', ' : '),
          }))}
        />
      ) : null}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: columnsTemplate(block.columns.length, block.ratio) }}
      >
        {block.columns.map((col, i) => (
          <div key={i} className="bg-muted/40 flex min-w-0 flex-col gap-2 rounded-md p-2">
            {col.map((leaf) => (
              <div key={leaf.id} className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <LeafEditor
                    block={leaf}
                    onChange={(next) =>
                      setCol(
                        i,
                        col.map((l) => (l.id === leaf.id ? next : l)),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={t('slideForm.removeBlock')}
                  onClick={() =>
                    setCol(
                      i,
                      col.filter((l) => l.id !== leaf.id),
                    )
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1">
              {(['heading', 'text', 'image'] as LeafKind[]).map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setCol(i, [...col, newLeaf(kind, kind === 'heading' ? 2 : 1)])}
                >
                  <Plus className="size-3" />
                  {t(`slideForm.block.${kind === 'heading' ? 'subheading' : kind}`)}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeafEditor({
  block,
  onChange,
}: {
  block: SlideLeafBlock;
  onChange: (next: SlideLeafBlock) => void;
}) {
  const { t } = useTranslation('editor');
  switch (block.type) {
    case 'heading':
      return (
        <div className="flex flex-col gap-1.5">
          {/* Block settings on one thin line above the field: level, then alignment. */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              {t('slideForm.block.heading')}
            </span>
            <Select
              aria-label={t('slideForm.headingLevel')}
              className="h-7 w-16 shrink-0 px-2 py-0 text-xs"
              value={String(block.level)}
              onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 })}
            >
              <option value="1">H1</option>
              <option value="2">H2</option>
            </Select>
            <AlignPicker value={block.align} onChange={(align) => onChange({ ...block, align })} />
          </div>
          <Input
            aria-label={t('slideForm.block.heading')}
            placeholder={t('slideForm.headingPlaceholder')}
            className={block.level === 1 ? 'text-lg font-bold' : 'font-semibold'}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </div>
      );
    case 'text':
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              {t('slideForm.block.text')}
            </span>
            <AlignPicker value={block.align} onChange={(align) => onChange({ ...block, align })} />
            <SizePicker value={block.size} onChange={(size) => onChange({ ...block, size })} />
          </div>
          <MarkdownEditor
            aria-label={t('slideForm.block.text')}
            placeholder={t('slideForm.bodyPlaceholder')}
            value={block.md}
            onChange={(md) => onChange({ ...block, md })}
          />
        </div>
      );
    case 'image':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <MediaUpload
            value={block.mediaId || null}
            onChange={(id) => onChange({ ...block, mediaId: id ?? '' })}
          />
          <Label className="flex-row items-center gap-2">
            {t('slideForm.imageSize')}
            <Select
              className="w-32"
              value={block.size}
              onChange={(e) => onChange({ ...block, size: e.target.value as typeof block.size })}
            >
              <option value="small">{t('slideForm.size.small')}</option>
              <option value="medium">{t('slideForm.size.medium')}</option>
              <option value="large">{t('slideForm.size.large')}</option>
              <option value="full">{t('slideForm.size.full')}</option>
            </Select>
          </Label>
          <Label className="flex-row items-center gap-2">
            {t('slideForm.imageAlign')}
            <Select
              className="w-32"
              value={block.align}
              onChange={(e) => onChange({ ...block, align: e.target.value as typeof block.align })}
            >
              <option value="left">{t('slideForm.align.left')}</option>
              <option value="center">{t('slideForm.align.center')}</option>
              <option value="right">{t('slideForm.align.right')}</option>
            </Select>
          </Label>
        </div>
      );
  }
}

/** Left / centre / right for a text-like block; centre is the default. */
function AlignPicker({
  value,
  onChange,
}: {
  value: SlideTextAlign | undefined;
  onChange: (align: SlideTextAlign) => void;
}) {
  const { t } = useTranslation('editor');
  const current = value ?? 'center';
  const items: { align: SlideTextAlign; icon: typeof AlignLeft }[] = [
    { align: 'left', icon: AlignLeft },
    { align: 'center', icon: AlignCenter },
    { align: 'right', icon: AlignRight },
  ];
  return (
    <Segmented
      size="sm"
      className="shrink-0"
      label={t('slideForm.textAlign')}
      value={current}
      onChange={onChange}
      options={items.map(({ align, icon }) => ({
        value: align,
        label: t(`slideForm.align.${align}`),
        icon,
      }))}
    />
  );
}

/** Small / medium / large text (20 / 30 / 40 px on the stage); medium is the default. */
function SizePicker({
  value,
  onChange,
}: {
  value: SlideTextSize | undefined;
  onChange: (size: SlideTextSize) => void;
}) {
  const { t } = useTranslation('editor');
  const current = value ?? 'medium';
  return (
    <Segmented
      size="sm"
      className="shrink-0"
      label={t('slideForm.textSize')}
      value={current}
      onChange={onChange}
      options={(['small', 'medium', 'large'] as SlideTextSize[]).map((size) => ({
        value: size,
        label: t(`slideForm.size.${size}`),
        short: t(`slideForm.sizeShort.${size}`),
      }))}
    />
  );
}
