import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createQuizMcp } from './quiz-mcp';
import { bundleGuideText } from '../quizzes/portable/bundle-guide';
import type { QuizPortableService } from '../quizzes/portable/quiz-portable.service';
const json = JSON.stringify({ format: 'quizdock/quiz', quiz: { title: 'QA' }, items: [] });
describe('QuizDock MCP', () => {
  let client: Client;
  let context: ReturnType<typeof createQuizMcp>;
  const portable = { importBundle: jest.fn() };
  const authorized = jest.fn();
  async function connect(write = false) {
    context = createQuizMcp(
      write
        ? {
            ownerId: 'bound-host',
            portable: portable as unknown as QuizPortableService,
            authorized,
          }
        : undefined,
    );
    client = new Client({ name: 'test', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await context.server.connect(a);
    await client.connect(b);
  }
  beforeEach(() => {
    jest.resetAllMocks();
    authorized.mockResolvedValue(true);
    portable.importBundle.mockResolvedValue({ id: 'draft', title: 'QA' });
  });
  afterEach(async () => {
    await client?.close();
    await context?.server.close();
  });
  it('exposes only the two read-only tools without an account and returns the generated guide', async () => {
    await connect();
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      'quiz_format',
      'validate_quiz',
    ]);
    const guide = await client.callTool({ name: 'quiz_format', arguments: {} });
    expect(guide.content).toEqual([{ type: 'text', text: bundleGuideText() }]);
    const report = await client.callTool({ name: 'validate_quiz', arguments: { json } });
    expect(report.structuredContent).toEqual({ valid: true, errors: [], warnings: [] });
    expect(portable.importBundle).not.toHaveBeenCalled();
  });
  it('binds import ownership to operator configuration, ignores a supplied owner and refuses invalid JSON', async () => {
    await connect(true);
    const bad = await client.callTool({ name: 'import_quiz', arguments: { json: '{}' } });
    expect(bad.isError).toBe(true);
    expect(portable.importBundle).not.toHaveBeenCalled();
    const good = await client.callTool({
      name: 'import_quiz',
      arguments: { json, ownerId: 'another-user' },
    });
    expect(good.structuredContent).toMatchObject({
      id: 'draft',
      ownerId: 'bound-host',
      status: 'draft',
    });
    expect(portable.importBundle).toHaveBeenCalledWith('bound-host', {
      buffer: Buffer.from(json),
      mimetype: 'application/json',
    });
  });
  it('rechecks a revoked host role before writing', async () => {
    await connect(true);
    authorized.mockResolvedValue(false);
    expect(
      (await client.callTool({ name: 'import_quiz', arguments: { json } })).structuredContent,
    ).toEqual({ code: 'auth.host_required' });
    expect(portable.importBundle).not.toHaveBeenCalled();
  });
  it('does not expose database errors to the model', async () => {
    await connect(true);
    authorized.mockRejectedValue(new Error('internal connection details'));
    const response = await client.callTool({ name: 'import_quiz', arguments: { json } });
    expect(response.structuredContent).toEqual({ code: 'mcp.import_failed' });
    expect(JSON.stringify(response)).not.toContain('internal connection');
  });
  it('limits imports to ten per minute', async () => {
    await connect(true);
    for (let n = 0; n < 10; n++)
      await client.callTool({ name: 'import_quiz', arguments: { json } });
    expect(
      (await client.callTool({ name: 'import_quiz', arguments: { json } })).structuredContent,
    ).toEqual({ code: 'mcp.rate_limit' });
    expect(portable.importBundle).toHaveBeenCalledTimes(10);
  });
  it('serializes imports and drains an in-flight write on shutdown', async () => {
    await connect(true);
    let finish!: (value: unknown) => void;
    portable.importBundle.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = client.callTool({ name: 'import_quiz', arguments: { json } });
    while (!finish) await new Promise((resolve) => setImmediate(resolve));
    expect(
      (await client.callTool({ name: 'import_quiz', arguments: { json } })).structuredContent,
    ).toEqual({ code: 'mcp.busy' });
    let drained = false;
    const drain = context.drain().then(() => {
      drained = true;
    });
    expect(drained).toBe(false);
    finish({ id: 'draft', title: 'QA' });
    await first;
    await drain;
    expect(drained).toBe(true);
  });
});
