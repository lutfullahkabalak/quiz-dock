import { cn } from '@/lib/utils';

/**
 * Tags as chips to narrow a list: every pressed one must be on an item. Many
 * tags scroll within the row rather than pushing the list away.
 */
export function TagFilter({
  label,
  tags,
  selected,
  onChange,
  className,
}: {
  label: string;
  tags: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}) {
  if (!tags.length) return null;
  const toggle = (tag: string) =>
    onChange(selected.includes(tag) ? selected.filter((x) => x !== tag) : [...selected, tag]);
  return (
    <div
      className={cn('flex max-h-14 shrink-0 flex-wrap gap-1 overflow-y-auto', className)}
      role="group"
      aria-label={label}
    >
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          aria-pressed={selected.includes(tag)}
          onClick={() => toggle(tag)}
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs transition-colors',
            selected.includes(tag)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'hover:bg-accent',
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

/** Every tag present on `items`, sorted. */
export function tagsOf(items: { tags: string[] }[]): string[] {
  return [...new Set(items.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b));
}
