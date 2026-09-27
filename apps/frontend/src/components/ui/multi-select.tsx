import { Check, ChevronsUpDown } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * A list to tick several values in, folded under a button that says what is
 * ticked: `allLabel` when none is (no filter), the label alone when one is, the
 * count otherwise. The list closes on Escape and on a click outside.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  allLabel,
  countLabel,
  className,
  ...aria
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Said when nothing is ticked. */
  allLabel: string;
  /** Said when several are: `count` ticked. */
  countLabel: (count: number) => string;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const summary =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? allLabel)
        : countLabel(value.length);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={box} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...aria}
        onClick={() => setOpen((o) => !o)}
        className="border-input bg-background text-foreground focus-visible:ring-ring flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
      >
        <span className="truncate">{summary}</span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="bg-background absolute top-full left-0 z-30 mt-1 min-w-full rounded-md border p-1 shadow-md"
        >
          {options.map((o) => {
            const checked = value.includes(o.value);
            return (
              <li key={o.value} role="option" aria-selected={checked}>
                <label className="hover:bg-accent text-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                  />
                  <span
                    className={cn(
                      'peer-focus-visible:ring-ring flex size-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-1',
                      checked && 'bg-primary border-primary text-primary-foreground',
                    )}
                    aria-hidden
                  >
                    {checked ? <Check className="size-3" /> : null}
                  </span>
                  {o.label}
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
