import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** A status's colour, the same wherever a quiz shows it: ready is green, archived grey. */
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'muted'> = {
  draft: 'default',
  ready: 'success',
  archived: 'muted',
};

/** A quiz's status (draft, ready, archived) as a badge. */
export function QuizStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'default'} className={cn('shrink-0', className)}>
      {t(`quizStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}
