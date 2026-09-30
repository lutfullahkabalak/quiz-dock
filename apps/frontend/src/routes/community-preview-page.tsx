import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CopyPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LoadFailed, PageLoading } from '@/components/ui/loading';
import { Notice } from '@/components/ui/notice';
import { PageTitle } from '@/components/ui/page-title';
import { MediaUrlContext } from '@/lib/media-url';
import {
  useCommunityControllerPreview,
  useCommunityControllerTake,
} from '../api/generated/community-store/community-store';
import { getQuizzesControllerListQueryKey } from '../api/generated/quizzes/quizzes';
import { apiErrorText, getAuthHeaders } from '../api/http';
import { useRole } from '../auth/use-role';
import { communityPreviewRoute } from '../router';
import type { CommunityPreviewDto } from '../api/generated/model';
import { QuizStepsPreview } from './quiz-steps-preview';

export function CommunityPreviewPage() {
  const { t } = useTranslation('store');
  const { key } = communityPreviewRoute.useParams();
  const { isHost } = useRole();
  const preview = useCommunityControllerPreview(key, { query: { enabled: isHost, retry: false } });
  if (!isHost) return <Notice tone="warning">{t('takeNeedsHost')}</Notice>;
  if (preview.isPending) return <PageLoading />;
  if (!preview.data) return <LoadFailed error={preview.error} notFound={t('notFound')} />;
  return <CommunityPreview key={key} entry={preview.data.data} />;
}

function CommunityPreview({ entry }: { entry: CommunityPreviewDto }) {
  const { t } = useTranslation('store');
  const navigate = useNavigate();
  const client = useQueryClient();
  const take = useCommunityControllerTake();
  // Binary reads need the local user's header too: an img/video src cannot add it.
  // Blob URLs let the existing quiz preview render images, Markdown and sound in
  // both local and OIDC modes without making the media endpoint public.
  const [media, setMedia] = useState<Record<string, string> | null>(null);
  const [mediaError, setMediaError] = useState<unknown>(null);
  useEffect(() => {
    const abort = new AbortController();
    const urls: string[] = [];
    const resolved: Record<string, string> = {};
    const queue = Object.entries(entry.media);
    setMedia(null);
    setMediaError(null);
    void Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        let next: [string, string] | undefined;
        while ((next = queue.shift())) {
          const [id, path] = next;
          const response = await fetch(path, {
            headers: getAuthHeaders(),
            credentials: 'same-origin',
            signal: abort.signal,
          });
          if (!response.ok) throw new Error('Media could not be loaded');
          const blob = await response.blob();
          if (abort.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          resolved[id] = url;
        }
      }),
    )
      .then(() => {
        if (!abort.signal.aborted) setMedia(resolved);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setMediaError(error);
          abort.abort();
        }
      });
    return () => {
      abort.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [entry.media]);
  const create = async () => {
    try {
      const { data } = await take.mutateAsync({ data: { key: entry.key } });
      await client.invalidateQueries({ queryKey: getQuizzesControllerListQueryKey() });
      await navigate({ to: '/quizzes/$quizId', params: { quizId: data.id } });
    } catch {
      /* The error remains next to the action. */
    }
  };
  const header = (
    <header className="flex flex-col gap-3">
      <Link to="/community" className="text-muted-foreground flex w-fit items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        {t('community.title')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{entry.title}</PageTitle>
        <Button onClick={() => void create()} disabled={take.isPending || !!entry.invalid}>
          <CopyPlus className="size-4" />
          {t('createFrom')}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {entry.author} · {t('licence', { name: entry.license })}
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          href={entry.source}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline"
        >
          {t('community.source', { source: entry.id })}
        </a>
        {entry.reportUrl ? (
          <a href={entry.reportUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {t('community.report')}
          </a>
        ) : null}
      </div>
      {take.error ? (
        <p role="alert" className="text-destructive text-sm">
          {apiErrorText(take.error, t('takeFailed'))}
        </p>
      ) : null}
    </header>
  );
  if (mediaError)
    return (
      <>
        {header}
        <LoadFailed error={mediaError} />
      </>
    );
  if (!media)
    return (
      <>
        {header}
        <PageLoading />
      </>
    );
  return (
    <MediaUrlContext.Provider value={(id) => media[id] ?? ''}>
      <QuizStepsPreview
        quiz={{
          title: entry.title,
          description: entry.description,
          questionCount: entry.questionCount,
          ownerName: entry.author,
          tags: entry.tags,
          license: entry.license,
          questions: entry.questions,
          slides: entry.slides,
        }}
        header={header}
      />
    </MediaUrlContext.Provider>
  );
}
