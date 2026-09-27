import { cn } from '@/lib/utils';

/**
 * Animated verdict for the participant's reveal: a ring draws itself, then the
 * check (or the cross) is stroked in. Pure SVG + CSS (see `.qd-mark` in
 * index.css), sized in em so it follows the surface base; still under
 * `prefers-reduced-motion`.
 */
export function ResultMark({ correct, className }: { correct: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      data-correct={correct}
      className={cn(
        'qd-verdict qd-mark size-[4.5em]',
        correct ? 'text-success' : 'text-destructive',
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle className="qd-mark-ring" cx="32" cy="32" r="28" />
      {correct ? (
        <path className="qd-mark-stroke" d="M18 33 L28 43 L46 22" />
      ) : (
        <>
          <path className="qd-mark-stroke" d="M22 22 L42 42" />
          <path className="qd-mark-stroke qd-mark-stroke-2" d="M42 22 L22 42" />
        </>
      )}
    </svg>
  );
}
