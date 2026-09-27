import { NotFoundException } from '@nestjs/common';
import { type Prisma, QuizStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** What a host reads: their quizzes, and those shared with the instance (not archived). */
export function readableBy(userId: string): Prisma.QuizWhereInput {
  return { OR: [{ ownerId: userId }, { shared: true, status: { not: QuizStatus.archived } }] };
}

/**
 * Checks that quiz `id` is within reach, else 404 `quiz.not_found` (never 403:
 * someone else's quiz is not even said to exist). `ownerId` undefined reaches
 * every quiz (a manager's scope).
 */
export async function requireQuiz(
  prisma: PrismaService,
  id: string,
  ownerId: string | undefined,
): Promise<void> {
  const quiz = await prisma.quiz.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!quiz) throw new NotFoundException('quiz.not_found');
}
