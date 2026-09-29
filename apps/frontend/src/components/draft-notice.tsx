import { History } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** "A draft was restored" banner with the one action that undoes it. */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation('common');
  return (
    <Notice
      role="status"
      icon={<History aria-hidden className="text-warning-text mt-1 size-4 shrink-0" />}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1">{t('draft.restored')}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onDiscard}>
          {t('draft.discard')}
        </Button>
      </div>
    </Notice>
  );
}
