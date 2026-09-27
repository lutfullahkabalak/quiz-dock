import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/loading';
import { quizItems } from '@/lib/quiz-items';
import { cn } from '@/lib/utils';
import { useQuizzesControllerGet } from '../api/generated/quizzes/quizzes';
import { StepStage } from './quiz-stage-preview';

/**
 * A card's picture in the grid: the quiz's first slide as it will show — or,
 * without a slide, its cover (`fallback`), else its first question. The quiz is
 * fetched only once its card comes into view, so a long list stays light.
 */
export function QuizFirstStep({
  quizId,
  hasCover,
  fallback,
  className,
}: {
  quizId: string;
  /** Whether the quiz has a cover, shown when it has no slide. */
  hasCover: boolean;
  /** The cover (or the neutral tile), when there is nothing better to show. */
  fallback: ReactNode;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const { data, isError } = useQuizzesControllerGet(quizId, { query: { enabled: seen } });

  const quiz = data?.data;
  const items = quiz ? quizItems(quiz) : [];
  const slideAt = items.findIndex((it) => it.kind === 'slide');
  const at = slideAt >= 0 ? slideAt : hasCover ? -1 : items.length > 0 ? 0 : -1;

  let body: ReactNode;
  if (isError || (quiz && at < 0)) body = fallback;
  else if (!quiz) body = <Skeleton className="h-full w-full rounded-none" />;
  else
    body = <StepStage item={items[at]} index={at} quiz={quiz} className="rounded-none border-0" />;

  return (
    // A picture, not a control: the card's link takes the click.
    <div
      ref={box}
      aria-hidden
      className={cn('pointer-events-none aspect-video w-full overflow-hidden', className)}
    >
      {body}
    </div>
  );
}
