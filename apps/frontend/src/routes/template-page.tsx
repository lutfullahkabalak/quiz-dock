import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CopyPlus, Ellipsis, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadFailed, PageLoading } from '@/components/ui/loading';
import { Notice } from '@/components/ui/notice';
import { PageTitle } from '@/components/ui/page-title';
import { Popover } from '@/components/ui/popover';
import { MediaUrlContext, mediaUrl } from '@/lib/media-url';
import type { StorePreviewDto } from '../api/generated/model';
import { useMeControllerMe } from '../api/generated/me/me';
import { getQuizzesControllerListQueryKey } from '../api/generated/quizzes/quizzes';
import {
  getStoreControllerListQueryKey,
  useStoreControllerPreview,
  useStoreControllerTake,
  useStoreControllerWithdraw,
} from '../api/generated/store/store';
import { apiErrorText } from '../api/http';
import { useRole } from '../auth/use-role';
import { getDemo } from '../config';
import { templateRoute } from '../router';
import { QuizStepsPreview } from './quiz-steps-preview';

/**
 * A shared template, before taking a copy (#39): the quiz preview itself (UI
 * system §3), fed with what the copy would create — the server reads the
 * template through the import. Only the header is the template's own.
 */
export function TemplatePage() {
  const { t } = useTranslation(['store', 'common']);
  const { templateId } = templateRoute.useParams();
  const {
    data,
    isPending,
    error: loadError,
  } = useStoreControllerPreview(templateId, { query: { retry: false } });
  if (isPending) return <PageLoading />;
  const template = data?.data;
  if (!template) return <LoadFailed error={loadError} notFound={t('notFound')} />;
  // Its media live in the catalogue: the stand-in ids the server gave point there.
  const resolve = (id: string) => template.media[id] ?? mediaUrl(id);
  return (
    <MediaUrlContext.Provider value={resolve}>
      <QuizStepsPreview
        quiz={{
          title: template.title,
          description: template.description,
          questionCount: template.questionCount,
          ownerName: template.author.name,
          tags: template.tags,
          license: template.license,
          questions: template.questions,
          slides: template.slides,
        }}
        header={<TemplateHeader template={template} />}
      />
    </MediaUrlContext.Provider>
  );
}

function TemplateHeader({ template }: { template: StorePreviewDto }) {
  const { t, i18n } = useTranslation(['store', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const take = useStoreControllerTake();
  const withdraw = useStoreControllerWithdraw();
  const { isHost, isManager } = useRole();
  const { data: me } = useMeControllerMe({ query: { staleTime: 60_000, retry: false } });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Withdrawing is its author's, or an admin's (the server says the same); never in a demo.
  const canWithdraw =
    !getDemo() && (isManager || (!!me && me.data.subject === template.author.subject));

  const onTake = async () => {
    setError(null);
    try {
      const { data: quiz } = await take.mutateAsync({ id: template.id });
      await queryClient.invalidateQueries({ queryKey: getQuizzesControllerListQueryKey() });
      await navigate({ to: '/quizzes/$quizId', params: { quizId: quiz.id } });
    } catch (e) {
      setError(apiErrorText(e, t('takeFailed')));
    }
  };
  const onWithdraw = async () => {
    setConfirming(false);
    setError(null);
    try {
      await withdraw.mutateAsync({ id: template.id });
      await queryClient.invalidateQueries({ queryKey: getStoreControllerListQueryKey() });
      await navigate({ to: '/templates' });
    } catch (e) {
      setError(apiErrorText(e, t('withdrawFailed')));
    }
  };

  return (
    <header className="flex flex-col gap-3">
      <Link to="/templates" className="text-muted-foreground flex w-fit items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        {t('backToCatalogue')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{template.title}</PageTitle>
        <div className="flex items-center gap-2">
          {isHost ? (
            <Button type="button" onClick={() => void onTake()} disabled={take.isPending}>
              <CopyPlus className="size-4" />
              {t('createFrom')}
            </Button>
          ) : null}
          {canWithdraw ? (
            <Popover
              align="end"
              trigger={({ open, toggle }) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('more')}
                  aria-expanded={open}
                  onClick={toggle}
                >
                  <Ellipsis className="size-4" />
                </Button>
              )}
            >
              {(close) => (
                <Button
                  type="button"
                  variant="destructive-outline"
                  size="sm"
                  onClick={() => {
                    close();
                    setConfirming(true);
                  }}
                >
                  <Trash2 className="size-4" />
                  {t('withdraw')}
                </Button>
              )}
            </Popover>
          ) : null}
        </div>
      </div>
      {template.description ? <p className="max-w-prose">{template.description}</p> : null}
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Badge variant="muted">{template.language}</Badge>
        <span>{t('questionCount', { count: template.questionCount })}</span>
        {template.slideCount > 0 ? (
          <span>{t('slideCount', { count: template.slideCount })}</span>
        ) : null}
        <span>
          {t('sharedBy', {
            name: template.author.name,
            date: new Date(template.sharedAt).toLocaleDateString(i18n.language),
          })}
        </span>
        {template.license ? <span>{t('licence', { name: template.license })}</span> : null}
      </p>
      {/* Creating a quiz is a host's action: the others read, and are told why. */}
      {isHost ? null : <p className="text-muted-foreground text-sm">{t('takeNeedsHost')}</p>}
      {template.invalid ? (
        <Notice tone="warning">
          {t('unreadable', {
            where:
              template.invalid.item === null
                ? t('unreadableManifest')
                : t('unreadableItem', { n: template.invalid.item }),
          })}
        </Notice>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        destructive
        title={t('withdrawConfirm.title')}
        description={t('withdrawConfirm.description')}
        confirmLabel={t('withdraw')}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void onWithdraw()}
      />
    </header>
  );
}
