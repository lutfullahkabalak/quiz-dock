import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { TEXT_QUIZ_MAX_BYTES } from './text-quiz-validation';

function isValidationRequest(req: Request): boolean {
  return req.method === 'POST' && /^\/api\/v1\/quizzes\/validate\/?$/i.test(req.path);
}

/** Only text validation needs the larger, escaped JSON envelope. */
export function configureTextQuizBodyParser(app: NestExpressApplication): void {
  app.useBodyParser('json', {
    limit: 2 * TEXT_QUIZ_MAX_BYTES + 64 * 1024,
    type: (req) =>
      isValidationRequest(req as Request) && Boolean((req as Request).is('application/json')),
  });
  // This handler precedes the default parser, so other routes keep their errors.
  app.use((error: { type?: string }, req: Request, res: Response, next: NextFunction) => {
    if (
      !isValidationRequest(req) ||
      (error.type !== 'entity.too.large' && error.type !== 'entity.parse.failed')
    ) {
      next(error);
      return;
    }
    const tooLarge = error.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      code: tooLarge ? 'import.bundle_too_large' : 'import.invalid_bundle',
    });
  });
  // Nest detects the first jsonParser and skips automatic registration. Explicitly
  // retain its default 100 kB parser for every request not consumed above.
  app.useBodyParser('json');
}
