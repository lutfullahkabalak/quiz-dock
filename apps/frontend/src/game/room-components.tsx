import type { RoomStandingsPayload } from '@quiz-dock/contracts';
import { ListChecks, ListPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Combobox } from '@/components/ui/combobox';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMeControllerMe } from '../api/generated/me/me';
import type { QuizDto } from '../api/generated/model';
import { useQuizzesControllerList } from '../api/generated/quizzes/quizzes';
import { type GameSocket, emitWithAckOrError } from './game-client';
import { LeaderboardList } from './live-components';

/** The room's name as the screens show it: its own, else "<host>'s room". */
export function roomLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  name: string | null | undefined,
  hostName: string | null | undefined,
): string {
  if (name) return name;
  return hostName ? t('live:room.defaultName', { host: hostName }) : t('live:room.fallbackName');
}

/**
 * The room's standings over its quizzes so far (#89): the top of the room, the
 * viewer's own line highlighted when they have one.
 */
export function RoomStandingsPanel({
  standings,
  max = 10,
  className,
}: {
  standings: RoomStandingsPayload;
  max?: number;
  className?: string;
}) {
  const { t } = useTranslation('live');
  return (
    <div className={cn('flex w-full flex-col gap-[0.5em]', className)}>
      <h3 className="text-muted-foreground font-semibold">
        {t('room.standingsTitle')}{' '}
        <span className="font-normal">
          · {t('room.afterQuizzes', { count: standings.quizzesPlayed })}
        </span>
      </h3>
      <LeaderboardList rows={standings.top} highlightRank={standings.you?.rank} max={max} />
    </div>
  );
}

/**
 * The host picks the room's next quiz (`host:next-quiz`): from the podium (the
 * results of the quiz just played kept or not, as when ending), or from the
 * lobby (the quiz picked is replaced). Only the host's own quizzes that can be
 * played — `ready`, with a question — are offered: the server refuses the rest.
 */
export function NextQuizButton({
  pin,
  socket,
  fromPodium,
  currentQuizId,
}: {
  pin: string;
  socket: GameSocket | null;
  fromPodium: boolean;
  currentQuizId: string | null;
}) {
  const { t } = useTranslation(['live', 'common']);
  const [open, setOpen] = useState(false);
  const [quizId, setQuizId] = useState('');
  const [archive, setArchive] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = useMeControllerMe({ query: { staleTime: 60_000, retry: false } }).data?.data;
  const quizzes = useQuizzesControllerList({ query: { enabled: open } }).data?.data ?? [];
  const playable = quizzes.filter(
    (q) =>
      q.ownerId === me?.id &&
      q.status === 'ready' &&
      q.questionCount > 0 &&
      (fromPodium || q.id !== currentQuizId),
  );
  const picked = playable.some((q) => q.id === quizId) ? quizId : '';
  const label = fromPodium ? t('control.nextQuiz') : t('control.changeQuiz');

  const confirm = async () => {
    if (!socket || !picked) return;
    setSending(true);
    setError(null);
    try {
      await emitWithAckOrError(socket, 'host:next-quiz', {
        pin,
        quizId: picked,
        archive: fromPodium && archive,
      });
      setOpen(false);
      setQuizId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Tooltip label={fromPodium ? t('control.nextQuizTooltip') : t('control.changeQuizTooltip')}>
        <Button
          type="button"
          variant={fromPodium ? 'main-action' : 'outline'}
          onClick={() => setOpen(true)}
        >
          <ListPlus className="size-4" />
          {label}
        </Button>
      </Tooltip>
      <ConfirmDialog
        open={open}
        wide
        title={label}
        description={
          fromPodium ? t('control.nextQuizDescription') : t('control.changeQuizDescription')
        }
        confirmLabel={sending ? t('common:loading') : t('control.openQuiz')}
        cancelLabel={t('common:cancel')}
        confirmDisabled={!picked || sending}
        onConfirm={() => void confirm()}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
      >
        {playable.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('control.noPlayableQuiz')}</p>
        ) : (
          <QuizPicker
            quizzes={playable}
            value={picked}
            onChange={setQuizId}
            playingId={fromPodium ? currentQuizId : null}
          />
        )}
        {fromPodium ? (
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
            />
            <span>
              <span className="font-medium">{t('control.archiveLabel')}</span>
              <span className="text-muted-foreground block">{t('control.archiveHint')}</span>
            </span>
          </label>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </ConfirmDialog>
    </>
  );
}

type PickableQuiz = QuizDto;

/**
 * A light "My quizzes" to pick from: search (title, description, tags), the
 * tags and the language as filters, a sort, and a line per quiz that says what
 * it is — its cover, title, the start of its description, its size, language,
 * tags and last change. Built on the combobox, kept open.
 */
function QuizPicker({
  quizzes,
  value,
  onChange,
  playingId,
}: {
  quizzes: PickableQuiz[];
  value: string;
  onChange: (id: string) => void;
  /** The quiz the room just played (it may be played again). */
  playingId: string | null;
}) {
  const { t, i18n } = useTranslation(['live', 'dashboard']);
  const [tags, setTags] = useState<string[]>([]);
  const [language, setLanguage] = useState('');
  const [sort, setSort] = useState<'recent' | 'title' | 'questions'>('recent');
  const allTags = [...new Set(quizzes.flatMap((q) => q.tags))].sort((a, b) => a.localeCompare(b));
  const languages = [...new Set(quizzes.map((q) => q.language))].sort();
  const kept = quizzes
    .filter((q) => tags.every((tag) => q.tags.includes(tag)))
    .filter((q) => !language || q.language === language)
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'questions'
          ? b.questionCount - a.questionCount
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const toggle = (tag: string) =>
    setTags((current) =>
      current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag],
    );
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <span className="mr-auto font-medium">{t('control.pickQuiz')}</span>
        {languages.length > 1 ? (
          <Select
            className="h-8 w-auto"
            value={language}
            aria-label={t('control.pickerLanguage')}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="">{t('control.pickerAllLanguages')}</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          className="h-8 w-auto"
          value={sort}
          aria-label={t('dashboard:sortBy')}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="recent">{t('dashboard:sortRecent')}</option>
          <option value="title">{t('dashboard:sortTitle')}</option>
          <option value="questions">{t('dashboard:sortQuestions')}</option>
        </Select>
      </div>
      {allTags.length ? (
        // Many tags: the row scrolls rather than pushing the list out of the dialog.
        <div
          className="flex max-h-14 shrink-0 flex-wrap gap-1 overflow-y-auto"
          role="group"
          aria-label={t('control.pickerTags')}
        >
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              onClick={() => toggle(tag)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs transition-colors',
                tags.includes(tag)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-accent',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      <Combobox
        inline
        className="min-h-0 flex-1"
        aria-label={t('control.pickQuiz')}
        value={value}
        onChange={onChange}
        placeholder={t('control.pickQuizPlaceholder')}
        emptyText={t('control.noQuizMatch')}
        options={kept.map((q) => ({
          value: q.id,
          label: q.title,
          keywords: `${q.description ?? ''} ${q.tags.join(' ')}`,
          quiz: q,
        }))}
        renderOption={({ quiz: q }) => (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            {q.coverMediaId ? (
              <img
                src={`/api/v1/media/${q.coverMediaId}`}
                alt=""
                className="size-12 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md">
                <ListChecks className="size-5" aria-hidden />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{q.title}</span>
                {q.id === playingId ? (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    · {t('control.pickerJustPlayed')}
                  </span>
                ) : null}
              </span>
              {q.description ? (
                <span className="text-muted-foreground truncate text-xs">{q.description}</span>
              ) : null}
              <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                <span>{t('control.quizQuestions', { count: q.questionCount })}</span>
                <span>· {q.language.toUpperCase()}</span>
                <span>· {t('control.pickerUpdated', { date: date(q.updatedAt) })}</span>
                {q.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="bg-muted rounded px-1">
                    {tag}
                  </span>
                ))}
                {q.tags.length > 3 ? <span>+{q.tags.length - 3}</span> : null}
              </span>
            </span>
          </span>
        )}
        footer={(shown) => (
          <p className="text-muted-foreground text-xs" role="status">
            {t('dashboard:matchCount', { count: shown })}
          </p>
        )}
      />
    </div>
  );
}
