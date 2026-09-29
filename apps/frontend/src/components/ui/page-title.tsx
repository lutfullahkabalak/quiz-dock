import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** The one title of a page: the same size and weight on every screen. */
export function PageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn('text-2xl font-bold tracking-tight', className)} {...props} />;
}

/** A section of a page. The spaced capitals stay for form legends only. */
export function SectionTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold', className)} {...props} />;
}
