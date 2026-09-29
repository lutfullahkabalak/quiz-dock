import type { User } from '@prisma/client';
import { QuizValidationController } from './quiz-validation.controller';
describe('validation endpoint', () => {
  it('returns validation without invoking persistence and limits callers independently', () => {
    const controller = new QuizValidationController();
    const user = { id: 'one' } as User;
    for (let n = 0; n < 60; n++)
      expect(controller.validate(user, { json: '{}' }).valid).toBe(false);
    expect(() => controller.validate(user, { json: '{}' })).toThrow('import.validation_busy');
    expect(controller.validate({ id: 'two' } as User, { json: '{}' }).valid).toBe(false);
  });
});
