import { Check, ChevronsUpDown } from 'lucide-react';
import { type KeyboardEvent, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line, muted (a count, a language…); searched too. */
  hint?: string;
}

/** Lower case, accents off: "Évaluation" is found by typing "eval". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * A searchable picker (the WAI-ARIA combobox pattern, without a dependency):
 * typing filters the options, arrows move, Enter picks, Escape closes the list
 * (and only the list — not a dialog around it). The list sits in the flow, not
 * in an overlay, so a modal dialog that scrolls its content never clips it.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  className,
  ...aria
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown when nothing matches what was typed. */
  emptyText: string;
  className?: string;
  'aria-label'?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    if (!query) return options;
    const q = fold(query);
    return options.filter((o) => fold(`${o.label} ${o.hint ?? ''}`).includes(q));
  }, [options, query]);

  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery(null);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (shown.length ? (i + step + shown.length) % shown.length : 0));
    } else if (e.key === 'Enter') {
      if (open && shown[active]) {
        e.preventDefault();
        pick(shown[active]);
      }
    } else if (e.key === 'Escape' && open) {
      // Close the list only: a dialog around it would otherwise close too.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setQuery(null);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
          {...aria}
          value={query ?? selected?.label ?? ''}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery(null);
          }}
          onKeyDown={onKeyDown}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 pr-8 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
        />
        <ChevronsUpDown
          className="text-muted-foreground pointer-events-none absolute top-2.5 right-2.5 size-4"
          aria-hidden
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="bg-background max-h-56 overflow-y-auto rounded-md border p-1 shadow-sm"
        >
          {shown.length === 0 ? (
            <li className="text-muted-foreground px-2 py-1.5 text-sm">{emptyText}</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                // Keep the focus in the input: a click must not blur (and close) first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  i === active && 'bg-accent',
                )}
              >
                <Check
                  className={cn('size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{o.label}</span>
                  {o.hint ? (
                    <span className="text-muted-foreground truncate text-xs">{o.hint}</span>
                  ) : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
