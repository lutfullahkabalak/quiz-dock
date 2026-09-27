import { BadRequestException } from '@nestjs/common';
import type { MediaKind } from '@prisma/client';
import { SLIDE_TWO_SOUNDS, blockSoundCount, slideLeaves } from '@quiz-dock/contracts';
import type { PrismaService } from '../prisma/prisma.service';
import type { SlideContent } from './dto/slide-content.schema';

/** The media ids a slide points at: its background and its image, video and sound blocks. */
export function slideMediaIds(slide: { blocks: unknown; mediaId: string | null }): string[] {
  const blocks = slideLeaves((slide.blocks ?? []) as SlideContent['blocks']);
  const ids = blocks.flatMap((b) => ('mediaId' in b ? [b.mediaId] : []));
  return slide.mediaId ? [slide.mediaId, ...ids] : ids;
}

/**
 * Checks the media a slide is saved with (#125): each asset exists, belongs to
 * the author and is of the kind its block holds (an image, a video, a sound; an
 * image or a video behind the slide), and the slide plays one sound at most —
 * the background's own counted once the server knows it is a video. `attached`
 * are the assets the slide already holds (a quiz handed over keeps them).
 */
export async function checkSlideMedia(
  prisma: PrismaService,
  ownerId: string,
  dto: SlideContent,
  attached: string[] = [],
): Promise<void> {
  const expected = new Map<string, MediaKind[]>();
  for (const b of slideLeaves(dto.blocks)) {
    if (b.type === 'image' || b.type === 'video' || b.type === 'audio') {
      expected.set(b.mediaId, [b.type]);
    }
  }
  if (dto.mediaId) expected.set(dto.mediaId, ['image', 'video']);
  if (expected.size === 0) return;
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: [...expected.keys()] }, OR: [{ ownerId }, { id: { in: attached } }] },
    select: { id: true, kind: true },
  });
  for (const [id, kinds] of expected) {
    const asset = assets.find((a) => a.id === id);
    if (!asset) throw new BadRequestException('media.not_found');
    if (!kinds.includes(asset.kind)) throw new BadRequestException('media.wrong_kind');
  }
  const background = assets.find((a) => a.id === dto.mediaId);
  const backgroundSounds = background?.kind === 'video' && dto.backgroundSound ? 1 : 0;
  if (blockSoundCount(dto.blocks) + backgroundSounds > 1) {
    throw new BadRequestException(SLIDE_TWO_SOUNDS);
  }
}
