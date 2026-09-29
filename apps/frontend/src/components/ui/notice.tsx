import { Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A short message in the page: a warning (the amber of `--warning`) or plain
 * information. The colours come from the tokens only, never from the palette.
 */
export function Notice({
  tone = 'warning',
  icon,
  role = 'note',
  className,
  children,
}: {
  tone?: 'warning' | 'info';
  /** Replaces the tone's own icon; `null` for none. */
  icon?: ReactNode;
  role?: 'note' | 'status' | 'alert';
  className?: string;
  children: ReactNode;
}) {
  const Icon = tone === 'warning' ? TriangleAlert : Info;
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        tone === 'warning' ? 'border-warning/45 bg-warning/10' : 'bg-muted/60',
        className,
      )}
    >
      {icon === undefined ? (
        <Icon
          aria-hidden
          className={cn(
            'mt-0.5 size-4 shrink-0',
            tone === 'warning' ? 'text-warning-text' : 'text-muted-foreground',
          )}
        />
      ) : (
        icon
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
