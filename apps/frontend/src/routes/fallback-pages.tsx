import { Link, useRouter } from '@tanstack/react-router';
import { CircleHelp, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/page-title';

/** Shared layout of the two dead-end pages: an icon, a title, a line, a way on. */
function Fallback({
  icon,
  title,
  text,
  retry,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  retry?: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <section className="content-sm flex flex-col items-center gap-4 py-16 text-center">
      <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
        {icon}
      </span>
      <PageTitle>{title}</PageTitle>
      <p className="text-muted-foreground">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/" className={buttonVariants({ variant: retry ? 'outline' : 'default' })}>
          {t('fallback.backHome')}
        </Link>
        {retry ? <Button onClick={retry}>{t('fallback.tryAgain')}</Button> : null}
      </div>
    </section>
  );
}

/** An address that matches no page: an old link, or something deleted. */
export function NotFoundPage() {
  const { t } = useTranslation('common');
  return (
    <Fallback
      icon={<CircleHelp aria-hidden className="size-6" />}
      title={t('fallback.notFoundTitle')}
      text={t('fallback.notFoundText')}
    />
  );
}

/** A page that threw while rendering: say so, and offer to try again. */
export function ErrorPage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  return (
    <Fallback
      icon={<TriangleAlert aria-hidden className="size-6" />}
      title={t('fallback.errorTitle')}
      text={t('fallback.errorText')}
      retry={() => void router.invalidate()}
    />
  );
}
