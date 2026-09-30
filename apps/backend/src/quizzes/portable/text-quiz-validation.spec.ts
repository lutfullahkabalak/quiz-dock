import { validateTextQuiz, TEXT_QUIZ_MAX_BYTES } from './text-quiz-validation';
import { fromBundle } from './quiz-bundle';
import { quizBundleSchema } from './quiz-bundle.schema';
const question = {
  kind: 'question',
  type: 'single_choice',
  prompt: 'Q?',
  options: [
    { text: 'A', color: 'red', shape: 'triangle', isCorrect: true },
    { text: 'B', color: 'blue', shape: 'diamond' },
  ],
};
const bundle = (items: unknown[] = [question]) => ({
  format: 'quizdock/quiz',
  quiz: { title: 'QA' },
  items,
});
describe('text-only validation', () => {
  it('accepts exactly the content accepted by the importer without media', () => {
    const input = bundle();
    expect(validateTextQuiz(JSON.stringify(input))).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
    expect(
      fromBundle(quizBundleSchema.parse(input), () => {
        throw new Error('No media');
      }).questions,
    ).toHaveLength(1);
  });
  it('reports fields on multiple rejected items', () => {
    const result = validateTextQuiz(
      JSON.stringify(
        bundle([
          { ...question, options: Array.from({ length: 9 }, () => question.options[0]) },
          { ...question, prompt: 'x'.repeat(1001) },
        ]),
      ),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'import.invalid_item', item: 1, field: 'options' }),
        expect.objectContaining({ code: 'import.invalid_item', item: 2, field: 'prompt' }),
      ]),
    );
  });
  it('allows incomplete drafts but reports completeness warnings for every item', () => {
    const input = bundle([
      { ...question, options: question.options.map((o) => ({ ...o, isCorrect: false })) },
      { kind: 'slide', blocks: [] },
    ]);
    const result = validateTextQuiz(JSON.stringify(input));
    expect(result).toMatchObject({ valid: true, errors: [] });
    expect(result.warnings).toEqual([
      { code: 'question.options.one_correct', item: 1, field: 'options' },
      { code: 'slide.empty', item: 2, field: 'blocks' },
    ]);
    expect(fromBundle(quizBundleSchema.parse(input), () => '')).toMatchObject({
      questions: expect.any(Array),
      slides: expect.any(Array),
    });
  });
  it('reports malformed JSON and schema errors in the native codes', () => {
    expect(validateTextQuiz('{').errors[0].code).toBe('import.invalid_bundle');
    expect(validateTextQuiz(JSON.stringify({ format: 'other' })).errors[0]).toMatchObject({
      code: 'import.invalid_bundle',
      field: 'format',
    });
  });
  it('requires media to remain absent and never fetches URLs', () => {
    expect(
      validateTextQuiz(JSON.stringify(bundle([{ ...question, media: 'media/a.png' }]))),
    ).toMatchObject({
      valid: false,
      errors: [{ code: 'import.media_missing', path: 'media/a.png' }],
    });
    expect(
      validateTextQuiz(JSON.stringify(bundle([{ ...question, media: 'http://127.0.0.1/private' }])))
        .valid,
    ).toBe(false);
  });
  it('bounds UTF-8 bytes and the number of diagnostics', () => {
    expect(validateTextQuiz('界'.repeat(TEXT_QUIZ_MAX_BYTES / 2)).errors[0].code).toBe(
      'import.bundle_too_large',
    );
    expect(
      validateTextQuiz(
        JSON.stringify(
          bundle(Array.from({ length: 500 }, () => ({ ...question, prompt: 'x'.repeat(1001) }))),
        ),
      ).errors.length,
    ).toBe(100);
  });
});
