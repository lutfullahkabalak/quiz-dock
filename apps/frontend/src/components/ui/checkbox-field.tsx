import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** A checkbox with its label in bold and, under it, what it does. */
export function CheckboxField({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  title,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <label
      className={cn('flex items-start gap-2 text-sm', disabled && 'opacity-60', className)}
      title={title}
    >
      <input
        type="checkbox"
        className="accent-primary mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-muted-foreground block">{hint}</span> : null}
      </span>
    </label>
  );
}
