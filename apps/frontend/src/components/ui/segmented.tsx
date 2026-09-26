import type { LucideIcon } from 'lucide-react';

/** A two- or three-way switch, as a row of pressed buttons; an icon keeps its label for screen readers. */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
}) {
  return (
    <div role="group" aria-label={label} className="bg-muted flex gap-1 rounded-md p-1 text-sm">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            title={Icon ? o.label : undefined}
            className={
              value === o.value
                ? 'bg-background flex items-center gap-1 rounded px-2.5 py-1 font-medium shadow-sm'
                : 'text-muted-foreground flex items-center gap-1 rounded px-2.5 py-1'
            }
          >
            {Icon ? (
              <>
                <Icon className="size-4" />
                <span className="sr-only">{o.label}</span>
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}
