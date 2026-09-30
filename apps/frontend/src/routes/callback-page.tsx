import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorText } from '../api/http';
import { takeAfterLogin, useAuth } from '../auth/auth-context';

/** One exchange per return from the provider: its code and state are good once. */
let pending: { search: string; done: Promise<void> } | null = null;

/**
 * Retour du fournisseur OIDC : le backend échange le code et ouvre la session
 * (cookie), puis on va au tableau de bord — ou à la page d'où venait la
 * connexion (un participant renvoyé vers `/login` depuis `/join/...`, RG-15).
 */
export function CallbackPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { completeOidcLogin, loginOidc } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = window.location.search;
    // StrictMode runs effects twice: the second run waits for the first exchange.
    if (pending?.search !== search) {
      pending = { search, done: completeOidcLogin(new URLSearchParams(search)) };
    }
    pending.done
      .then(() => navigate({ to: (takeAfterLogin() ?? '/quizzes') as '/quizzes', replace: true }))
      .catch((e: unknown) => setError(apiErrorText(e, t('callback.failed'))));
  }, [completeOidcLogin, navigate, t]);

  if (!error) {
    return (
      <p className="text-muted-foreground flex items-center justify-center gap-2 py-12">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('callback.loading')}
      </p>
    );
  }
  // Never a dead end: try again, or go back where one started.
  return (
    <Card className="content-sm">
      <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
        <p className="font-semibold">{t('callback.errorTitle')}</p>
        <p className="text-muted-foreground text-sm" role="alert">
          {error}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
            {t('callback.backHome')}
          </Link>
          <Button type="button" onClick={() => void loginOidc()}>
            {t('callback.tryAgain')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
