import { Body, Controller, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { configureTextQuizBodyParser } from './text-quiz-body-parser';
import { TEXT_QUIZ_MAX_BYTES } from './text-quiz-validation';

@Controller('quizzes')
class ParserTestController {
  @Post('validate')
  validate(@Body() body: { quiz: string }): { size: number } {
    return { size: body.quiz.length };
  }

  @Post()
  create(@Body() body: { quiz: string }): { size: number } {
    return { size: body.quiz.length };
  }
}

describe('text quiz body parser isolation', () => {
  let app: NestExpressApplication;
  let base: string;
  let baseline: NestExpressApplication;
  let baselineUrl: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ParserTestController],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    configureTextQuizBodyParser(app);
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    baseline = module.createNestApplication<NestExpressApplication>({ logger: false });
    baseline.setGlobalPrefix('api/v1');
    baseline.useGlobalFilters(new HttpExceptionFilter());
    await baseline.listen(0, '127.0.0.1');
    baselineUrl = await baseline.getUrl();
  });
  afterAll(async () => {
    await app.close();
    await baseline.close();
  });

  function post(path: string, body: string, url = base): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }

  it('accepts a large validation envelope, including query strings and trailing slashes', async () => {
    const body = JSON.stringify({ quiz: 'x'.repeat(150 * 1024) });
    for (const path of ['/api/v1/quizzes/validate', '/api/v1/quizzes/validate/?source=mcp']) {
      const response = await post(path, body);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ size: 150 * 1024 });
    }
  });

  it('keeps the default 100 kB limit and error response on other routes', async () => {
    const body = JSON.stringify({ quiz: 'x'.repeat(150 * 1024) });
    const response = await post('/api/v1/quizzes', body);
    const unchanged = await post('/api/v1/quizzes', body, baselineUrl);
    expect(response.status).toBe(unchanged.status);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toEqual(await unchanged.json());
  });

  it('keeps ordinary JSON parsing on other routes', async () => {
    const response = await post('/api/v1/quizzes', JSON.stringify({ quiz: 'small' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ size: 5 });
  });

  it('only maps malformed JSON to import errors on validation', async () => {
    const validation = await post('/api/v1/quizzes/validate', '{');
    expect(validation.status).toBe(400);
    expect(await validation.json()).toEqual({ code: 'import.invalid_bundle' });
    const other = await post('/api/v1/quizzes', '{');
    const unchanged = await post('/api/v1/quizzes', '{', baselineUrl);
    expect(other.status).toBe(unchanged.status);
    expect(await other.json()).toEqual(await unchanged.json());
  });

  it('maps oversized validation envelopes to the import size error', async () => {
    const response = await post(
      '/api/v1/quizzes/validate',
      JSON.stringify({ quiz: 'x'.repeat(3 * TEXT_QUIZ_MAX_BYTES) }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: 'import.bundle_too_large' });
  });
});
