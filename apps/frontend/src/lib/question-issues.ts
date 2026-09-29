import { type QuestionIssue, type QuestionTypeName, questionIssues } from '@quiz-dock/contracts';
import { validationText } from '../api/error-text';
import type { QuizDetailDtoQuestionsItem } from '../api/generated/model';

/** What a saved question still misses to be played: the server's own check. */
export function savedQuestionIssues(q: QuizDetailDtoQuestionsItem): QuestionIssue[] {
  return questionIssues({
    type: q.type as QuestionTypeName,
    prompt: q.prompt,
    media: q.media as { visual?: unknown; audio?: unknown } | null,
    multiSelect: q.multiSelect,
    numericValue: q.numericValue == null ? null : Number(q.numericValue),
    numericTolerance: q.numericTolerance == null ? null : Number(q.numericTolerance),
    options: q.options,
    acceptedAnswers: q.acceptedAnswers,
  });
}

/** A message shown under a field: an error blocks the save, a warning does not. */
export interface FieldIssue {
  /** Dotted path of the field (`options.1.alt`). */
  field: string;
  text: string;
  tone: 'error' | 'warning';
}

/** Completeness issues as warnings: a draft saves them, publishing waits for them. */
export const issuesAsWarnings = (issues: QuestionIssue[]): FieldIssue[] =>
  issues.map((i) => ({ field: i.path.join('.'), text: validationText(i.code), tone: 'warning' }));

/** Structure issues (a Zod parse, a refused save) as errors, by field. */
export const issuesAsErrors = (
  issues: { path: PropertyKey[]; code: string; message?: string }[],
): FieldIssue[] =>
  issues.map((i) => ({
    field: i.path.map(String).join('.') || '_',
    // A business rule carries its domain code as its message.
    text: validationText(i.code === 'custom' && i.message ? i.message : i.code),
    tone: 'error',
  }));

/** The issues about `field` or anything under it (`options` → `options.1.alt`). */
export const issuesFor = (issues: FieldIssue[], field: string): FieldIssue[] =>
  issues.filter((i) => i.field === field || i.field.startsWith(`${field}.`));

/** Scrolls to a field the author must see (`options.1.alt` → the options) and focuses it. */
export function focusField(field: string) {
  const box = document.getElementById(`qf-${field.split('.')[0]}`);
  if (!box) return;
  // A folded setting opens: the field must be seen.
  for (
    let fold = box.closest('details');
    fold;
    fold = fold.parentElement?.closest('details') ?? null
  ) {
    fold.open = true;
  }
  box.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  box
    .querySelector<HTMLElement>('input, select, textarea, [contenteditable="true"], button')
    ?.focus({ preventScroll: true });
}
