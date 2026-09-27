import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** A turning wheel, with what it waits for said to screen readers (and shown when `label`). */
export function Spinner({
  label,
  showLabel = false,
  className,
}: {
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('common');
  const text = label ?? t('loading');
  return (
    <span
      role="status"
      className={cn('text-muted-foreground inline-flex items-center gap-2', className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {showLabel ? <span>{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  );
}

/** A whole page on its way: the wheel and its word, centred in the room the page will take. */
export function PageLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center">
      <Spinner label={label} showLabel />
    </div>
  );
}

/** A placeholder of the shape to come, pulsing. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('bg-muted block animate-pulse rounded-md', className)} />;
}

/**
 * A list on its way: as many rows (or cards) as a page usually holds, the shape
 * of what will fill them, so the page does not jump when it arrives.
 */
export function ListSkeleton({
  rows = 4,
  variant = 'list',
  className,
}: {
  rows?: number;
  variant?: 'list' | 'grid';
  className?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <div
      role="status"
      aria-label={t('loading')}
      className={cn(
        variant === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-2',
        className,
      )}
    >
      {Array.from({ length: rows }, (_, i) =>
        variant === 'grid' ? (
          <div key={i} className="flex flex-col overflow-hidden rounded-lg border">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-center gap-4 rounded-lg border p-3">
            <Skeleton className="size-14 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ),
      )}
    </div>
  );
}
