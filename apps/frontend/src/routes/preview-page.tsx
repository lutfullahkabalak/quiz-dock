import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageTitle } from '@/components/ui/page-title';
import { LoadFailed, PageLoading } from '@/components/ui/loading';
import type { QuizDetailDto } from '../api/generated/model';
import { useMediaControllerCredits } from '../api/generated/media/media';
import { useQuizzesControllerGet } from '../api/generated/quizzes/quizzes';
import { previewRoute } from '../router';
import { QuizStepsPreview } from './quiz-steps-preview';

export function PreviewPage() {
  const { t } = useTranslation(['editor', 'common']);
  const { quizId } = previewRoute.useParams();
  const { data, isLoading, error } = useQuizzesControllerGet(quizId);

  if (isLoading) return <PageLoading />;
  if (error || !data) return <LoadFailed error={error} notFound={t('notFound')} />;
  return <QuizPreview quiz={data.data} />;
}

function QuizPreview({ quiz }: { quiz: QuizDetailDto }) {
  const { t } = useTranslation('editor');
  return (
    <QuizStepsPreview
      quiz={quiz}
      header={
        <header className="flex flex-col gap-2">
          <Link
            to="/quizzes/$quizId"
            params={{ quizId: quiz.id }}
            className="text-muted-foreground flex w-fit items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" />
            {t('preview.backToEditor')}
          </Link>
          <PageTitle>{quiz.title}</PageTitle>
          {/* La description est du texte brut : on l'affiche tel qu'il a été tapé. */}
          {quiz.description ? (
            <p className="text-muted-foreground max-w-prose text-sm whitespace-pre-line">
              {quiz.description}
            </p>
          ) : null}
        </header>
      }
      footer={<QuizCredits quizId={quiz.id} />}
    />
  );
}

/** The credits of the quiz's media (#53): what a CC-BY licence asks to be shown. */
function QuizCredits({ quizId }: { quizId: string }) {
  const { t } = useTranslation('editor');
  const { data } = useMediaControllerCredits(quizId);
  const credits = data?.data.credits ?? [];
  if (credits.length === 0) return null;
  return (
    <section className="text-muted-foreground border-t pt-3 text-sm">
      <h2 className="text-foreground mb-1 font-medium">{t('preview.credits')}</h2>
      <ul className="flex flex-col gap-0.5">
        {credits.map((credit) => (
          <li key={credit}>{credit}</li>
        ))}
      </ul>
    </section>
  );
}
