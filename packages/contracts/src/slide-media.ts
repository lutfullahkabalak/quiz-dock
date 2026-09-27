import type { SlideBackgroundVideo, SlideBlock, SlideLeafBlock } from './index';
import type { LiveQuestionMedia } from './question-media';

/**
 * Media on slides (#125): a Video or a Sound block, or a video background.
 * A slide plays at most one sound at a time — a Sound block, a Video block with
 * its sound, or the background video with its sound; every other video plays
 * muted. Checked by the builder and again by the server.
 */

/** Error code of a slide with more than one media playing sound. */
export const SLIDE_TWO_SOUNDS = 'slide.two_sounds';

/** Every leaf block of a slide, columns opened, in reading order. */
export function slideLeaves(blocks: readonly SlideBlock[]): SlideLeafBlock[] {
  return blocks.flatMap((b) => (b.type === 'columns' ? b.columns.flat() : [b]));
}

/** How many blocks play a sound: a Sound block, a Video block that keeps its own. */
export function blockSoundCount(blocks: readonly SlideBlock[]): number {
  return slideLeaves(blocks).filter((b) => b.type === 'audio' || (b.type === 'video' && b.sound))
    .length;
}

/** What a slide shows and plays, as the live payload carries it. */
interface LiveSlideMedia {
  blocks: readonly SlideBlock[];
  backgroundVideo?: SlideBackgroundVideo | null;
}

/**
 * The slide's one sound-bearing media, in a question's shape — what the console's
 * transport steers and what a device that hears the slide must load. Null when
 * the slide plays no sound.
 */
export function slideSoundMedia(slide: LiveSlideMedia): LiveQuestionMedia | null {
  for (const b of slideLeaves(slide.blocks)) {
    if (b.type === 'audio' && b.url) {
      return {
        visual: null,
        audio: {
          url: b.url,
          durationMs: b.durationMs ?? 0,
          peaks: b.peaks ?? [],
          gainDb: b.gainDb ?? 0,
          size: b.size,
        },
      };
    }
    if (b.type === 'video' && b.sound && b.url) {
      return { visual: liveVideo(b.url, b.gainDb, b.durationMs), audio: null };
    }
  }
  const bg = slide.backgroundVideo;
  if (bg?.sound) return { visual: liveVideo(bg.url, bg.gainDb, bg.durationMs), audio: null };
  return null;
}

function liveVideo(url: string, gainDb = 0, durationMs?: number): LiveQuestionMedia['visual'] {
  return { kind: 'video', source: 'upload', url, gainDb, ...(durationMs ? { durationMs } : {}) };
}

/** The slide's videos that play muted: blocks without their sound, a muted background. */
export function slideMutedVideos(slide: LiveSlideMedia): string[] {
  const urls = slideLeaves(slide.blocks).flatMap((b) =>
    b.type === 'video' && !b.sound && b.url ? [b.url] : [],
  );
  if (slide.backgroundVideo && !slide.backgroundVideo.sound) urls.push(slide.backgroundVideo.url);
  return urls;
}

/** Whether a slide plays anything: a sound, or a video (muted or not). */
export function slideHasPlayback(slide: LiveSlideMedia): boolean {
  return !!slide.backgroundVideo || slideLeaves(slide.blocks).some(isPlayable);
}

const isPlayable = (b: SlideLeafBlock) => b.type === 'video' || b.type === 'audio';

/**
 * How long the slide's timed media play, in ms — the longest of its Video and
 * Sound blocks, and its background video when played once with its sound. A
 * looped (or muted) background is a decor: it never holds the slide. Null when
 * nothing is timed or no length is known.
 */
export function slideTimedMs(slide: LiveSlideMedia): number | null {
  const lengths = slideLeaves(slide.blocks).flatMap((b) =>
    isPlayable(b) && 'durationMs' in b && b.durationMs ? [b.durationMs] : [],
  );
  const bg = slide.backgroundVideo;
  if (bg && !bg.loop && bg.sound && bg.durationMs) lengths.push(bg.durationMs);
  return lengths.length ? Math.max(...lengths) : null;
}

/** A media step: a question, or the slide `slideIndex` shown before question `questionIndex`. */
export interface MediaStepRef {
  questionIndex: number;
  slideIndex?: number;
}

/** Whether two payloads speak of the same step (a slide and its question share `questionIndex`). */
export function sameMediaStep(a: MediaStepRef | null | undefined, b: MediaStepRef): boolean {
  return (
    !!a && a.questionIndex === b.questionIndex && (a.slideIndex ?? -1) === (b.slideIndex ?? -1)
  );
}
