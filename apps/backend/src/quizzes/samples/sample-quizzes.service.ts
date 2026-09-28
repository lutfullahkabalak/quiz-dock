import { Injectable } from '@nestjs/common';
import { type Quiz, QuizStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { questionCreateData, questionMediaIds } from '../../questions/question-data';
import { slideData } from '../../slides/slide-data';
import { SAMPLE_QUIZZES, type SampleQuiz } from './sample-quizzes.data';

/**
 * Ready-to-play sample quizzes, so a fresh install can be tried in seconds.
 * Written straight through Prisma (no ownership checks needed: we create for a
 * known owner) — the data itself is validated against the API schemas in the spec.
 */
@Injectable()
export class SampleQuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the sample quizzes for `ownerId` (status `ready`), newest last. */
  async createFor(ownerId: string): Promise<Quiz[]> {
    const created: Quiz[] = [];
    for (const sample of SAMPLE_QUIZZES) {
      created.push(await this.createOne(ownerId, sample));
    }
    return created;
  }

  private createOne(ownerId: string, sample: SampleQuiz): Promise<Quiz> {
    return this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: {
          ownerId,
          title: sample.title,
          description: sample.description,
          language: sample.language,
          status: QuizStatus.ready,
          questionCount: sample.questions.length,
          questions: {
            create: sample.questions.map((dto, orderIndex) =>
              questionCreateData(dto, orderIndex, questionMediaIds(dto)),
            ),
          },
        },
      });
      const first = await tx.question.findFirst({
        where: { quizId: quiz.id, orderIndex: 0 },
        select: { id: true },
      });
      const intro = sample.intro;
      await tx.slide.create({
        data: {
          quizId: quiz.id,
          beforeQuestionId: first?.id ?? null,
          orderIndex: 0,
          ...slideData(intro),
        },
      });
      return quiz;
    });
  }
}
