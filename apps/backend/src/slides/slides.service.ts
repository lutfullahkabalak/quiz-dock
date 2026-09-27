import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReorderItemsDto } from './dto/reorder-items.dto';
import type { SlideContent } from './dto/slide-content.schema';
import { checkSlideMedia, slideMediaIds } from './slide-media';
import { slideData } from './slide-data';
import { requireQuiz } from '../quizzes/quiz-access';

/** Temporary shift so questions can be renumbered without hitting @@unique([quizId, orderIndex]). */
const REORDER_OFFSET = 1000;

/**
 * Slides (#7): content items of the quiz sequence, anchored **before** a question
 * (`beforeQuestionId`) or at the end (`null`). A question's own `orderIndex`
 * stays contiguous and untouched, so scoring, stats and exports never see slides.
 */
@Injectable()
export class SlidesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends a slide at the very end of the quiz (after the last question). */
  async add(ownerId: string, quizId: string, dto: SlideContent) {
    await requireQuiz(this.prisma, quizId, ownerId);
    await checkSlideMedia(this.prisma, ownerId, dto);
    const agg = await this.prisma.slide.aggregate({
      where: { quizId, beforeQuestionId: null },
      _max: { orderIndex: true },
    });
    return this.prisma.slide.create({
      data: {
        quizId,
        beforeQuestionId: null,
        orderIndex: (agg._max.orderIndex ?? -1) + 1,
        ...slideData(dto),
      },
    });
  }

  async update(ownerId: string, slideId: string, dto: SlideContent) {
    const slide = await this.assertSlideOwned(ownerId, slideId);
    await checkSlideMedia(this.prisma, ownerId, dto, slideMediaIds(slide));
    return this.prisma.slide.update({ where: { id: slideId }, data: slideData(dto) });
  }

  async remove(ownerId: string, slideId: string): Promise<void> {
    await this.assertSlideOwned(ownerId, slideId);
    await this.prisma.slide.delete({ where: { id: slideId } });
  }

  /**
   * Rewrites the whole sequence: questions get `orderIndex` 0..n-1 in the order
   * given; each slide is anchored to the first question that follows it (or to
   * the end) with an `orderIndex` among the slides sharing that anchor.
   */
  async reorderItems(ownerId: string, quizId: string, dto: ReorderItemsDto) {
    await requireQuiz(this.prisma, quizId, ownerId);
    const [questions, slides] = await Promise.all([
      this.prisma.question.findMany({ where: { quizId }, select: { id: true } }),
      this.prisma.slide.findMany({ where: { quizId }, select: { id: true } }),
    ]);
    const questionIds = new Set(questions.map((q) => q.id));
    const slideIds = new Set(slides.map((s) => s.id));
    const { items } = dto;
    if (items.length !== questionIds.size + slideIds.size) {
      throw new BadRequestException('quiz.reorder_incomplete');
    }
    const seen = new Set<string>();
    for (const it of items) {
      const known = it.kind === 'question' ? questionIds.has(it.id) : slideIds.has(it.id);
      if (!known || seen.has(it.id)) {
        throw new BadRequestException('quiz.item_not_in_quiz');
      }
      seen.add(it.id);
    }

    // Walk the sequence: pending slides attach to the next question met.
    const questionOrder: string[] = [];
    const slideUpdates: { id: string; beforeQuestionId: string | null; orderIndex: number }[] = [];
    let pending: string[] = [];
    for (const it of items) {
      if (it.kind === 'slide') {
        pending.push(it.id);
        continue;
      }
      pending.forEach((id, orderIndex) =>
        slideUpdates.push({ id, beforeQuestionId: it.id, orderIndex }),
      );
      pending = [];
      questionOrder.push(it.id);
    }
    pending.forEach((id, orderIndex) =>
      slideUpdates.push({ id, beforeQuestionId: null, orderIndex }),
    );

    await this.prisma.$transaction([
      ...questionOrder.map((id, i) =>
        this.prisma.question.update({
          where: { id },
          data: { orderIndex: i + REORDER_OFFSET },
        }),
      ),
      ...questionOrder.map((id, i) =>
        this.prisma.question.update({ where: { id }, data: { orderIndex: i } }),
      ),
      ...slideUpdates.map((s) =>
        this.prisma.slide.update({
          where: { id: s.id },
          data: { beforeQuestionId: s.beforeQuestionId, orderIndex: s.orderIndex },
        }),
      ),
    ]);
    return this.prisma.slide.findMany({ where: { quizId }, orderBy: { orderIndex: 'asc' } });
  }

  private async assertSlideOwned(ownerId: string, slideId: string) {
    const slide = await this.prisma.slide.findFirst({
      where: { id: slideId, quiz: { ownerId } },
      select: {
        id: true,
        quizId: true,
        blocks: true,
        mediaId: true,
        videoMediaId: true,
        audioMediaId: true,
      },
    });
    if (!slide) {
      throw new NotFoundException('slide.not_found');
    }
    return slide;
  }
}
