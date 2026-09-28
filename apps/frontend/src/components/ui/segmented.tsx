import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A choice among a few, as a row of pressed buttons. An icon, or a `short` text,
 * stands in for the label on screen; the label stays the button's name.
 * `sm`: the editor's small pickers.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: LucideIcon; short?: string }>;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const small = size === 'sm';
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'bg-muted flex gap-1 rounded-md p-1 text-sm',
        small && 'gap-0.5 p-0.5 text-xs',
        className,
      )}
    >
      {options.map((o) => {
        const Icon = o.icon;
        const shown = Icon ? (
          <Icon className={small ? 'size-3.5' : 'size-4'} />
        ) : (
          (o.short ?? o.label)
        );
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            aria-label={Icon || o.short ? o.label : undefined}
            onClick={() => onChange(o.value)}
            title={Icon || o.short ? o.label : undefined}
            className={cn(
              'flex items-center gap-1 rounded',
              small ? 'px-2 py-0.5' : 'px-2.5 py-1',
              value === o.value
                ? 'bg-background font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {shown}
          </button>
        );
      })}
    </div>
  );
}
