import { IMPORT_MAX_BYTES } from './bundle-archive';
import { quizBundleSchema } from './quiz-bundle.schema';
import { BundleContentError, collectMediaPaths, fromBundle } from './quiz-bundle';

/** Text-only conversion is bounded independently of uploads carrying binary media. */
export const TEXT_QUIZ_MAX_BYTES = Math.min(IMPORT_MAX_BYTES, 1024 * 1024);
export interface QuizValidationIssue {
  code:
    | 'import.invalid_bundle'
    | 'import.invalid_item'
    | 'import.media_missing'
    | 'import.bundle_too_large';
  item?: number;
  field?: string;
  path?: string;
  detail?: string;
}
export interface QuizValidationResult {
  valid: boolean;
  errors: QuizValidationIssue[];
}

/** Pure dry-run: the importer's structural and content schemas, with no database, media writes or network. */
export function validateTextQuiz(json: string): QuizValidationResult {
  if (Buffer.byteLength(json, 'utf8') > TEXT_QUIZ_MAX_BYTES)
    return { valid: false, errors: [{ code: 'import.bundle_too_large' }] };
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return { valid: false, errors: [{ code: 'import.invalid_bundle' }] };
  }
  const parsed = quizBundleSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.slice(0, 100).map((issue) => ({
        code: 'import.invalid_bundle',
        field: issue.path.join('.') || '_',
        detail: issue.code,
      })),
    };
  const bundle = parsed.data;
  const errors: QuizValidationIssue[] = [];
  for (const path of collectMediaPaths(bundle)) errors.push({ code: 'import.media_missing', path });
  if (errors.length) return { valid: false, errors: errors.slice(0, 100) };
  // Check every item so the model can repair several errors in one round.
  bundle.items.forEach((item, index) => {
    if (errors.length >= 100) return;
    try {
      fromBundle({ ...bundle, items: [item] }, () => {
        throw new Error('Unexpected media reference');
      });
    } catch (err) {
      if (err instanceof BundleContentError)
        errors.push(
          ...err.issues.map((issue) => ({
            code: 'import.invalid_item' as const,
            item: index + 1,
            field: issue.field,
            detail: issue.code,
          })),
        );
      else errors.push({ code: 'import.invalid_bundle', item: index + 1 });
    }
  });
  return { valid: errors.length === 0, errors: errors.slice(0, 100) };
}
