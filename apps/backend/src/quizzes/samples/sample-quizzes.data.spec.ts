import { questionContentSchema, questionIssues } from '../../questions/dto/question-content.schema';
import { slideContentSchema } from '../../slides/dto/slide-content.schema';
import { SAMPLE_QUIZZES } from './sample-quizzes.data';

describe('SAMPLE_QUIZZES', () => {
  it('ships two English quizzes (France, Taiwan)', () => {
    expect(SAMPLE_QUIZZES.map((s) => s.title)).toEqual(['Discover France', 'Discover Taiwan']);
    expect(SAMPLE_QUIZZES.every((s) => s.language === 'en')).toBe(true);
  });

  it.each(SAMPLE_QUIZZES.map((s) => [s.title, s] as const))(
    '%s: every question and the intro slide pass the API schemas, complete (the sample is ready)',
    (_title, sample) => {
      for (const question of sample.questions) {
        const res = questionContentSchema.safeParse(question);
        expect(
          res.success ? null : { prompt: question.prompt, issues: res.error.issues },
        ).toBeNull();
        expect({ prompt: question.prompt, issues: questionIssues(question) }).toEqual({
          prompt: question.prompt,
          issues: [],
        });
      }
      expect(slideContentSchema.safeParse(sample.intro).success).toBe(true);
      expect(sample.questions.length).toBeGreaterThanOrEqual(8);
    },
  );
});
