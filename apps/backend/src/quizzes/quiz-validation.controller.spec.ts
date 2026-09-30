import { QuizValidationController } from './quiz-validation.controller';
describe('validation endpoint', () => {
  it('returns validation without persistence or per-user counters', () => {
    const controller = new QuizValidationController();
    for (let n = 0; n < 70; n++)
      expect(controller.validate({ json: '{}' })).toMatchObject({ valid: false, warnings: [] });
  });
});
