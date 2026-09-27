#!/usr/bin/env node
/**
 * Development fixture: a hundred `ready` quizzes, varied enough to stress the
 * lists that show them (My quizzes, the room's quiz picker): titles in several
 * languages, descriptions of all lengths, tags, 1 to 15 playable questions,
 * last changes spread over a year. Every title starts with `[stress]`.
 *
 *   pnpm --filter @quiz-dock/backend db:seed-stress                 # 100, to the seat holder
 *   pnpm --filter @quiz-dock/backend db:seed-stress --count 250
 *   pnpm --filter @quiz-dock/backend db:seed-stress --owner local:billy
 *   pnpm --filter @quiz-dock/backend db:seed-stress --clean         # removes them (and their sessions)
 *
 * The database is the one `prisma.config.ts` targets (DATABASE_URL, else the
 * development database from the root `.env`). Never a production one: this
 * writes fake content.
 */
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

const PREFIX = '[stress]';
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const url =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'live'}:${process.env.POSTGRES_PASSWORD ?? 'live'}` +
    `@localhost:${process.env.POSTGRES_PORT ?? '15432'}/${process.env.POSTGRES_DB ?? 'quizdock'}?schema=public`;
const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

const SUBJECTS = [
  ['Capitals of the world', 'en'],
  ['Capitales européennes', 'fr'],
  ['Ríos de España', 'es'],
  ['Security onboarding', 'en'],
  ['Sensibilisation RGPD', 'fr'],
  ['Phishing: spot the fake', 'en'],
  ['Histoire de France', 'fr'],
  ['World War II', 'en'],
  ['Astronomy basics', 'en'],
  ['Chimie organique', 'fr'],
  ['Football legends', 'en'],
  ['Cinéma des années 90', 'fr'],
  ['Kitchen French', 'en'],
  ['Mathématiques — fractions', 'fr'],
  ['Music theory', 'en'],
  ['Geografía de América', 'es'],
  ['Company values', 'en'],
  ['Premiers secours', 'fr'],
  ['中国历史', 'zh'],
  ['台灣小吃', 'zh-TW'],
  ['Programming trivia', 'en'],
  ['Art moderne', 'fr'],
];
const TAGS = [
  'geo',
  'history',
  'science',
  'security',
  'onboarding',
  'fun',
  'sport',
  'culture',
  'maths',
  'language',
  'work',
  'kids',
  'music',
  'food',
  'tech',
];
const DESCRIPTIONS = [
  null,
  'A short warm-up.',
  'Ten minutes to check the basics before the real session starts.',
  'For new colleagues in their first week: what to do, whom to ask, and the few rules that matter most. Played in the room, answers on the phones, explanations at each reveal.',
];

/** Deterministic pseudo-random, so two runs give the same bank. */
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (list) => list[Math.floor(rand() * list.length)];

async function owner() {
  const wanted = option('owner', null);
  if (wanted) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ oidcSubject: wanted }, { displayName: wanted }] },
    });
    if (!user)
      throw new Error(`No user "${wanted}" (an OIDC subject such as local:billy, or a name)`);
    return user;
  }
  const seat = await prisma.hostSeat.findUnique({ where: { id: 1 }, include: { user: true } });
  if (!seat?.user) throw new Error('Nobody holds the host seat: pass --owner <subject or name>');
  return seat.user;
}

async function clean() {
  const ids = (
    await prisma.quiz.findMany({ where: { title: { startsWith: PREFIX } }, select: { id: true } })
  ).map((q) => q.id);
  await prisma.gameSessionLog.deleteMany({ where: { quizId: { in: ids } } });
  await prisma.quiz.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} ${PREFIX} quizzes.`);
}

async function seedBank() {
  const user = await owner();
  const count = Number(option('count', '100'));
  const now = Date.now();
  for (let n = 1; n <= count; n++) {
    const [subject, language] = pick(SUBJECTS);
    const questionCount = 1 + Math.floor(rand() * 15);
    const tags = [...new Set([pick(TAGS), pick(TAGS), pick(TAGS)])].slice(
      0,
      1 + Math.floor(rand() * 3),
    );
    const updatedAt = new Date(now - Math.floor(rand() * 365) * 86_400_000);
    await prisma.quiz.create({
      data: {
        ownerId: user.id,
        title: `${PREFIX} ${subject} #${n}`,
        description: pick(DESCRIPTIONS),
        status: 'ready',
        language,
        tags,
        questionCount,
        updatedAt,
        questions: {
          create: Array.from({ length: questionCount }, (_, i) => ({
            orderIndex: i,
            type: 'single_choice',
            prompt: `Question ${i + 1} of ${subject}?`,
            timeLimitS: 20,
            options: {
              create: [
                { orderIndex: 0, text: 'Right', color: 'red', shape: 'triangle', isCorrect: true },
                { orderIndex: 1, text: 'Wrong', color: 'blue', shape: 'diamond', isCorrect: false },
              ],
            },
          })),
        },
      },
    });
  }
  console.log(`Created ${count} ${PREFIX} quizzes for ${user.displayName} (${user.oidcSubject}).`);
}

try {
  if (flag('clean')) await clean();
  else await seedBank();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
