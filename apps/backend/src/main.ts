import 'reflect-metadata';
import { json, type Request, type Response, type NextFunction } from 'express';
import { TEXT_QUIZ_MAX_BYTES } from './quizzes/portable/text-quiz-validation';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import { isOidcMode } from './auth/auth-mode';
import { sameOriginMiddleware } from './auth/oidc/same-origin.middleware';
import { cspMiddleware } from './common/csp';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { trustProxy } from './common/trust-proxy';
import { buildSwaggerDocument } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Which hops may speak for the client (`X-Forwarded-For`, `X-Forwarded-Proto`):
  // `req.ip` and `req.secure` follow `TRUST_PROXY`, like the sockets.
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy());
  app.enableCors();
  const validationParser = json({ limit: 2 * TEXT_QUIZ_MAX_BYTES + 64 * 1024 });
  app.use('/api/v1/quizzes/validate', (req: Request, res: Response, next: NextFunction) => {
    validationParser(req, res, (error?: { type?: string }) => {
      if (!error) {
        next();
        return;
      }
      const tooLarge = error.type === 'entity.too.large';
      res
        .status(tooLarge ? 413 : 400)
        .json({ code: tooLarge ? 'import.bundle_too_large' : 'import.invalid_bundle' });
    });
  });
  // The pages say where their scripts, styles, frames and requests may come from.
  app.use(cspMiddleware());
  // The browser session is a cookie: what changes something comes from our own pages.
  if (isOidcMode()) app.use(sameOriginMiddleware());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'config.js', 'branding/override.css'] });
  // Validation runtime des DTO Zod (createZodDto) sur toutes les routes.
  app.useGlobalPipes(new ZodValidationPipe());
  // Sérialise les erreurs en corps tokenisé { code, params? } (ADR 0001).
  app.useGlobalFilters(new HttpExceptionFilter());

  // OpenAPI auto-généré → consommé par Orval côté frontend (technique §2.3).
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`QuizDock API démarrée sur le port ${port}`, 'Bootstrap');
}

void bootstrap();
