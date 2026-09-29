import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One line of a `⋯` menu (a `Popover`); `destructive` for what cannot be undone. */
export function MenuItem({
  destructive,
  disabled,
  onClick,
  children,
}: {
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap disabled:pointer-events-none disabled:opacity-50',
        destructive && 'text-destructive',
      )}
    >
      {children}
    </button>
  );
}

/** What separates the destructive line from the rest of a menu. */
export function MenuSeparator() {
  return <hr className="border-border my-1" />;
}
