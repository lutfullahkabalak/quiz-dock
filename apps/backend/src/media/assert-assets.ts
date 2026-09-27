import { BadRequestException } from '@nestjs/common';
import type { MediaKind } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Checks the media an author puts in a place (a question's slots, an answer's
 * picture, a background, a cover, a slide): each asset exists, is the author's
 * — or is already held there (`attached`: a quiz handed over keeps its media) —
 * and is of the kind the place holds. `media.not_found` / `media.wrong_kind`.
 */
export async function assertAssets(
  prisma: PrismaService,
  ownerId: string,
  expected: Map<string, MediaKind>,
  attached: (string | null | undefined)[] = [],
): Promise<void> {
  if (expected.size === 0) return;
  const held = attached.filter((id): id is string => !!id);
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: [...expected.keys()] }, OR: [{ ownerId }, { id: { in: held } }] },
    select: { id: true, kind: true },
  });
  for (const [id, kind] of expected) {
    const asset = assets.find((a) => a.id === id);
    if (!asset) throw new BadRequestException('media.not_found');
    if (asset.kind !== kind) throw new BadRequestException('media.wrong_kind');
  }
}

/** One picture expected in a place, or nothing when the place is empty. */
export function expectImage(id: string | null | undefined): Map<string, MediaKind> {
  return new Map(id ? [[id, 'image']] : []);
}
