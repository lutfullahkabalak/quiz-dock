import { describe, expect, it } from 'vitest';
import { questionContentSchema, questionIssues } from '../src/question-content';

type OptIn = {
  color?: string;
  shape?: string;
  isCorrect?: boolean;
  correctOrderIndex?: number;
  text?: string;
};

const opt = (o: OptIn = {}) => ({
  color: 'red',
  shape: 'triangle',
  text: 'x',
  ...o,
});

const base = { prompt: 'Q ?', timeLimitS: 20 };

/** Structure only: what every save requires. */
const holds = (input: unknown) => questionContentSchema.safeParse(input).success;
/** Structure and completeness: what a ready quiz requires. */
const ok = (input: unknown) => {
  const parsed = questionContentSchema.safeParse(input);
  return parsed.success && questionIssues(parsed.data).length === 0;
};
/** Every code a question gets, from its structure or its completeness. */
const codes = (input: unknown) => {
  const parsed = questionContentSchema.safeParse(input);
  return parsed.success
    ? questionIssues(parsed.data).map((i) => i.code)
    : parsed.error.issues.map((i) => i.message);
};

describe('structure vs completeness (UI system §1.5)', () => {
  it('a draft question saves incomplete: no prompt, no right answer', () => {
    const draft = { prompt: '', type: 'single_choice', options: [opt(), opt()] };
    expect(holds(draft)).toBe(true);
    expect(codes(draft)).toEqual(['question.prompt.required', 'question.options.one_correct']);
  });

  it('a media stands for the prompt', () => {
    const q = {
      prompt: '',
      type: 'poll',
      options: [opt(), opt()],
      media: { visual: { kind: 'image', assetId: 'I'.repeat(26) }, audio: null },
    };
    expect(ok(q)).toBe(true);
  });

  it('a numeric question may leave its target for later', () => {
    expect(holds({ ...base, type: 'numeric' })).toBe(true);
    expect(codes({ ...base, type: 'numeric' })).toEqual([
      'question.numeric.value_required',
      'question.numeric.tolerance_required',
    ]);
  });

  it('issues point at their field', () => {
    const q = questionContentSchema.parse({
      ...base,
      type: 'image_choice',
      options: [
        { color: 'red', shape: 'triangle', isCorrect: true, mediaId: 'A'.repeat(26), alt: 'A' },
        { color: 'blue', shape: 'diamond', alt: 'B' },
      ],
    });
    expect(questionIssues(q)).toEqual([
      { code: 'question.image.picture_required', path: ['options', 1, 'mediaId'] },
    ]);
  });
});

describe('questionContentSchema — validation par type (§4)', () => {
  it('text outline is on by default (readable over any background)', () => {
    const parsed = questionContentSchema.parse({
      type: 'poll',
      prompt: 'Hi?',
      options: [
        { text: 'A', color: 'red', shape: 'circle' },
        { text: 'B', color: 'blue', shape: 'square' },
      ],
    });
    expect(parsed.textOutline).toBe(true);
    expect(parsed.textTone).toBe('light');
  });

  it('single_choice : 2–6 options, exactement 1 correcte', () => {
    expect(
      ok({
        ...base,
        type: 'single_choice',
        options: [opt({ isCorrect: true }), opt()],
      }),
    ).toBe(true);
    expect(ok({ ...base, type: 'single_choice', options: [opt({ isCorrect: true })] })).toBe(false); // 1 option
    expect(ok({ ...base, type: 'single_choice', options: [opt(), opt()] })).toBe(false); // 0 correcte
    expect(
      ok({
        ...base,
        type: 'single_choice',
        options: [opt({ isCorrect: true }), opt({ isCorrect: true })],
      }),
    ).toBe(false); // 2 correctes
  });

  it('multiple_choice : ≥ 1 correcte', () => {
    expect(
      ok({
        ...base,
        type: 'multiple_choice',
        options: [opt({ isCorrect: true }), opt({ isCorrect: true }), opt()],
      }),
    ).toBe(true);
    expect(ok({ ...base, type: 'multiple_choice', options: [opt(), opt()] })).toBe(false);
  });

  it('true_false : exactement 2 options', () => {
    expect(
      ok({
        ...base,
        type: 'true_false',
        options: [opt({ isCorrect: true }), opt()],
      }),
    ).toBe(true);
    expect(
      ok({
        ...base,
        type: 'true_false',
        options: [opt({ isCorrect: true }), opt(), opt()],
      }),
    ).toBe(false);
  });

  it('ordering : correctOrderIndex doit former une permutation 0..n-1', () => {
    expect(
      ok({
        ...base,
        type: 'ordering',
        options: [
          opt({ correctOrderIndex: 0 }),
          opt({ correctOrderIndex: 1 }),
          opt({ correctOrderIndex: 2 }),
        ],
      }),
    ).toBe(true);
    expect(
      ok({
        ...base,
        type: 'ordering',
        options: [opt({ correctOrderIndex: 0 }), opt({ correctOrderIndex: 2 })],
      }),
    ).toBe(false); // trou
    expect(
      ok({
        ...base,
        type: 'ordering',
        options: [opt({ correctOrderIndex: 0 }), opt()],
      }),
    ).toBe(false); // index manquant
  });

  it('text_input : ≥ 1 réponse acceptée, pas d’options', () => {
    expect(
      ok({
        ...base,
        type: 'text_input',
        acceptedAnswers: [{ text: 'Paris' }],
      }),
    ).toBe(true);
    expect(ok({ ...base, type: 'text_input', acceptedAnswers: [] })).toBe(false);
    expect(
      ok({
        ...base,
        type: 'text_input',
        acceptedAnswers: [{ text: 'x' }],
        options: [opt(), opt()],
      }),
    ).toBe(false); // options interdites
  });

  it('numeric : value + tolerance ≥ 0, pas d’options', () => {
    expect(ok({ ...base, type: 'numeric', numericValue: 42, numericTolerance: 1 })).toBe(true);
    expect(ok({ ...base, type: 'numeric', numericValue: 42 })).toBe(false); // tolérance manquante
    expect(
      ok({
        ...base,
        type: 'numeric',
        numericValue: 42,
        numericTolerance: -1,
      }),
    ).toBe(false); // tolérance négative
  });

  it('poll : options sans bonne réponse', () => {
    expect(ok({ ...base, type: 'poll', options: [opt(), opt()] })).toBe(true);
    expect(
      ok({
        ...base,
        type: 'poll',
        options: [opt({ isCorrect: true }), opt()],
      }),
    ).toBe(false);
  });

  it('timeLimitS borné 5–240', () => {
    const q = (t: number) => ({
      ...base,
      timeLimitS: t,
      type: 'single_choice',
      options: [opt({ isCorrect: true }), opt()],
    });
    expect(ok(q(5))).toBe(true);
    expect(ok(q(240))).toBe(true);
    expect(ok(q(4))).toBe(false);
    expect(ok(q(241))).toBe(false);
  });

  it('answerExplanation: optional, nullable, capped at 2000 chars (#5)', () => {
    const q = (answerExplanation?: string | null) => ({
      ...base,
      type: 'single_choice',
      options: [opt({ isCorrect: true }), opt()],
      ...(answerExplanation === undefined ? {} : { answerExplanation }),
    });
    expect(ok(q())).toBe(true);
    expect(ok(q(null))).toBe(true);
    expect(ok(q('Because **Paris**.'))).toBe(true);
    expect(ok(q('x'.repeat(2001)))).toBe(false);
  });
});

describe('questionContentSchema — media slots', () => {
  const id = (c: string) => c.repeat(26);
  const poll = { ...base, type: 'poll', options: [opt(), opt({ color: 'blue', shape: 'circle' })] };
  const video = { kind: 'video', source: 'upload', assetId: id('V') };
  const audio = {
    assetId: id('A'),
    origin: 'upload',
    durationMs: 5000,
    peaks: new Array(200).fill(0.3),
  };

  it('takes an image with a sound, or a video alone', () => {
    expect(ok({ ...poll, media: { visual: { kind: 'image', assetId: id('I') }, audio } })).toBe(
      true,
    );
    expect(ok({ ...poll, media: { visual: video, audio: null } })).toBe(true);
  });

  it('refuses a video with an audio track', () => {
    const res = questionContentSchema.safeParse({ ...poll, media: { visual: video, audio } });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.message)).toContain('media.video_with_audio');
  });
});

describe('questionContentSchema — image choice', () => {
  const id = (c: string) => c.repeat(26);
  const pic = (i: number, o: Record<string, unknown> = {}) => ({
    color: ['red', 'blue', 'yellow', 'green'][i],
    shape: ['triangle', 'diamond', 'circle', 'square'][i],
    mediaId: id(String.fromCharCode(65 + i)),
    alt: `Picture ${i + 1}`,
    ...o,
  });
  const q = (options: unknown[], extra: Record<string, unknown> = {}) => ({
    ...base,
    type: 'image_choice',
    options,
    ...extra,
  });
  const two = [pic(0, { isCorrect: true }), pic(1)];
  const four = [pic(0), pic(1, { isCorrect: true }), pic(2), pic(3)];
  const messages = codes;

  it('takes 2 or 4 pictures, never 3', () => {
    expect(ok(q(two))).toBe(true);
    expect(ok(q(four))).toBe(true);
    expect(messages(q([...two, pic(2)]))).toContain('question.image.count');
    expect(ok(q([pic(0, { isCorrect: true })]))).toBe(false);
  });

  it('one right picture, or several when multiSelect', () => {
    expect(ok(q([pic(0, { isCorrect: true }), pic(1, { isCorrect: true })]))).toBe(false);
    expect(ok(q([pic(0), pic(1)]))).toBe(false);
    const both = [pic(0, { isCorrect: true }), pic(1, { isCorrect: true })];
    expect(ok(q(both, { multiSelect: true }))).toBe(true);
    expect(ok(q([pic(0), pic(1)], { multiSelect: true }))).toBe(false);
  });

  it('partial credit only with several right pictures', () => {
    expect(ok(q(two, { scoring: 'partial' }))).toBe(false);
    expect(ok(q(two, { scoring: 'partial', multiSelect: true }))).toBe(true);
    expect(ok(q(two, { scoring: 'closest' }))).toBe(false);
  });

  it('every answer has a picture and its alt, and no text', () => {
    expect(messages(q([pic(0, { isCorrect: true }), pic(1, { alt: undefined })]))).toContain(
      'question.image.alt_required',
    );
    expect(messages(q([pic(0, { isCorrect: true }), pic(1, { alt: '   ' })]))).toContain(
      'question.image.alt_required',
    );
    expect(messages(q([pic(0, { isCorrect: true }), pic(1, { mediaId: undefined })]))).toContain(
      'question.image.picture_required',
    );
    expect(messages(q([pic(0, { isCorrect: true }), pic(1, { text: 'Dog' })]))).toContain(
      'question.image.no_text',
    );
  });

  it('no picture or video of its own, a sound is fine', () => {
    const audio = {
      assetId: id('S'),
      origin: 'upload',
      durationMs: 5000,
      peaks: new Array(200).fill(0.3),
    };
    const image = { kind: 'image', assetId: id('I') };
    const video = { kind: 'video', source: 'upload', assetId: id('V') };
    expect(messages(q(two, { media: { visual: image, audio: null } }))).toContain(
      'question.image.no_visual',
    );
    expect(ok(q(two, { media: { visual: video, audio: null } }))).toBe(false);
    expect(ok(q(two, { media: { visual: null, audio } }))).toBe(true);
  });

  it('multiSelect belongs to the image choice alone', () => {
    expect(
      ok({
        ...base,
        type: 'multiple_choice',
        multiSelect: true,
        options: [opt({ isCorrect: true }), opt()],
      }),
    ).toBe(false);
  });
});
