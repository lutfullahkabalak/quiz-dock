import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PinForm } from '@/components/pin-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageTitle } from '@/components/ui/page-title';

/**
 * Saisie du PIN (§5.1, 1ʳᵉ étape). Le pseudo et la salle d'attente vivent sur
 * `/join/$pin` (atteignable aussi par QR), qui décide reprise vs nouveau join.
 */
export function JoinPage() {
  const { t } = useTranslation(['join', 'common']);
  return (
    <section className="content-phone flex flex-col items-center gap-6 px-4 py-12 text-center">
      <PageTitle>{t('title')}</PageTitle>
      <Card className="content-sm">
        <CardHeader>
          <CardTitle>{t('pinCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PinForm
            stacked
            autoFocus
            label={t('pinLabel')}
            placeholder={t('pinPlaceholder')}
            submit={
              <>
                <LogIn className="size-4" />
                {t('continue')}
              </>
            }
          />
        </CardContent>
      </Card>
    </section>
  );
}
