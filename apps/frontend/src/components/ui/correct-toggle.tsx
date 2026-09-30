import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Whether an answer is a right one, as a pill that reads at a glance: ticked in
 * green, or an empty circle. `single`: one right answer (a radio), else several.
 */
export function CorrectToggle({
  checked,
  single,
  label,
  onChange,
}: {
  checked: boolean;
  single: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const Icon = checked ? Check : Circle;
  return (
    <button
      type="button"
      role={single ? 'radio' : 'checkbox'}
      aria-checked={checked}
      // A radio is chosen, not unchosen: another answer takes its place.
      onClick={() => onChange(single ? true : !checked)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
        checked
          ? 'border-success bg-success/15 text-foreground font-semibold'
          : 'border-input text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className={cn('size-3.5', checked && 'text-success')} aria-hidden />
      {label}
    </button>
  );
}
