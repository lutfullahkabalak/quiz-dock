import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';
import { bundleGuideText } from '../quizzes/portable/bundle-guide';
import { TEXT_QUIZ_MAX_BYTES, validateTextQuiz } from '../quizzes/portable/text-quiz-validation';
import type { QuizPortableService } from '../quizzes/portable/quiz-portable.service';

interface ImportAccount {
  ownerId: string;
  portable: Pick<QuizPortableService, 'importBundle'>;
  /** Check the configured account's host role again before each write. */
  authorized: () => Promise<boolean>;
}
const result = (value: Record<string, unknown>, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  structuredContent: value,
  isError,
});

export function createQuizMcp(account?: ImportAccount) {
  const server = new McpServer(
    { name: 'quizdock', version: '1.0.0' },
    {
      instructions:
        'Use quiz_format to obtain the current format, then validate_quiz to repair the text-only JSON. import_quiz creates a new independent draft in the configured host account. Review its questions before playing. No media or remote URLs are fetched.',
    },
  );
  let windowEnd = 0;
  let calls = 0;
  let imports = 0;
  let pending: Promise<unknown> | null = null;
  const quota = (write = false) => {
    if (Date.now() >= windowEnd) {
      windowEnd = Date.now() + 60_000;
      calls = 0;
      imports = 0;
    }
    return ++calls <= 60 && (!write || ++imports <= 10);
  };
  const json = {
    json: z
      .string()
      .max(TEXT_QUIZ_MAX_BYTES)
      .describe('The complete quiz.json as a JSON string, without Markdown fences.'),
  };
  server.registerTool(
    'quiz_format',
    {
      description: 'Get the current QuizDock format guide generated from the importer schemas.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      quota()
        ? { content: [{ type: 'text', text: bundleGuideText() }] }
        : result({ code: 'mcp.rate_limit' }, true),
  );
  server.registerTool(
    'validate_quiz',
    {
      description:
        'Validate text-only quiz JSON without writing anything. Returns structural errors and completeness warnings with item numbers and fields. Incomplete drafts can be imported.',
      inputSchema: json,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ json }) =>
      quota() ? result({ ...validateTextQuiz(json) }) : result({ code: 'mcp.rate_limit' }, true),
  );
  if (account)
    server.registerTool(
      'import_quiz',
      {
        description:
          'Create a new draft in the configured host account. Does not overwrite any quiz. The input must pass validate_quiz; no media.',
        inputSchema: json,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ json }) => {
        if (!quota(true)) return result({ code: 'mcp.rate_limit' }, true);
        if (pending) return result({ code: 'mcp.busy' }, true);
        const validation = validateTextQuiz(json);
        if (!validation.valid) return result({ ...validation }, true);
        pending = (async () => {
          try {
            if (!(await account.authorized())) return result({ code: 'auth.host_required' }, true);
            const quiz = await account.portable.importBundle(account.ownerId, {
              buffer: Buffer.from(json),
              mimetype: 'application/json',
            });
            return result({
              id: quiz.id,
              title: quiz.title,
              status: 'draft',
              ownerId: account.ownerId,
            });
          } catch (err) {
            if (err instanceof BadRequestException)
              return result({ error: err.getResponse() }, true);
            return result({ code: 'mcp.import_failed' }, true);
          }
        })();
        try {
          return (await pending) as ReturnType<typeof result>;
        } finally {
          pending = null;
        }
      },
    );
  return {
    server,
    drain: async () => {
      await pending;
    },
  };
}

/** Stdout is reserved for JSON-RPC; EOF/signals close the server and drain an in-flight import. */
export async function runQuizMcp(account?: ImportAccount): Promise<void> {
  const { server, drain } = createQuizMcp(account);
  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: 2 * TEXT_QUIZ_MAX_BYTES + 64 * 1024,
  });
  let finish!: () => void;
  const closed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const close = () => {
    void server.close();
  };
  transport.onclose = finish;
  await server.connect(transport);
  // connect() wraps transport.onclose; the callback above is preserved by the protocol.
  server.server.onerror = () => {
    process.stderr.write('QuizDock MCP transport error.\n');
    close();
  };
  process.stdin.once('end', close);
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    await closed;
    await drain();
  } finally {
    process.stdin.off('end', close);
    process.off('SIGINT', close);
    process.off('SIGTERM', close);
    await server.close();
  }
}
