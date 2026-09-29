import { useTranslation } from 'react-i18next';
import { JoinPin } from '@/components/join-pin';
import { Card, CardContent } from '@/components/ui/card';
import { PageTitle } from '@/components/ui/page-title';

/**
 * Saisie du PIN (§5.1, 1ʳᵉ étape), the same as the home page's. The nickname and
 * the lobby live on `/join/$pin` (reached by the QR code too), which decides
 * between taking a place back and a new join.
 */
export function JoinPage() {
  const { t } = useTranslation(['join', 'common']);
  return (
    <section className="content-phone flex flex-col items-center gap-6 px-4 py-12 text-center">
      <PageTitle>{t('title')}</PageTitle>
      <Card className="content-sm">
        <CardContent className="pt-6">
          <JoinPin autoFocus />
        </CardContent>
      </Card>
    </section>
  );
}
