import { cn } from '@/lib/utils';

/**
 * An answer's shape (technique §4: colour and shape, never colour alone),
 * drawn rather than typed: a font's ▲ ◆ ● ■ come at uneven sizes and heights.
 * Each shape fits the same 24-unit box and is balanced for the eye — a circle
 * or a diamond drawn as large as the square would look bigger, a triangle
 * smaller — so a row of answers reads even. Sized by the text around it (1em).
 */
const PATHS: Record<string, string> = {
  triangle: 'M12 2.5 22.5 20.5H1.5Z',
  diamond: 'M12 1.5 22.5 12 12 22.5 1.5 12Z',
  circle: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z',
  square: 'M3 3h18v18H3Z',
  star: 'M12 1.2 15.1 8.2 22.6 8.8 16.9 13.8 18.6 21.2 12 17.3 5.4 21.2 7.1 13.8 1.4 8.8 8.9 8.2Z',
  hexagon: 'M12 1.5 21.5 7v10L12 22.5 2.5 17V7Z',
  heart:
    'M12 21.5 3.6 13.3C1.2 10.9 1.2 7 3.6 4.7s6.1-2.3 8.4 0c2.3-2.3 6-2.3 8.4 0s2.4 6.2 0 8.6Z',
  cross: 'M8.5 2h7v6.5H22v7h-6.5V22h-7v-6.5H2v-7h6.5Z',
};

export function ShapeIcon({ shape, className }: { shape: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn('inline-block size-[1em] shrink-0 fill-current align-[-0.125em]', className)}
    >
      <path d={PATHS[shape] ?? PATHS.circle} />
    </svg>
  );
}
