import type { SlideVideo } from './index';
import type { LiveAudio, LiveQuestionMedia } from './question-media';

/**
 * Media on slides (#125): settings of the slide, like a question's — a video
 * filling the slide behind its content, and a sound. One sound at most: a
 * video that plays its own excludes the sound, as a question's video does; a
 * muted video and a sound go together. Checked by the builder and the server.
 */

/** Error code of a slide with a video playing its sound next to a sound. */
export const SLIDE_TWO_SOUNDS = 'slide.two_sounds';

/** What a slide plays, as the live payload carries it. */
interface LiveSlideMedia {
  video?: SlideVideo | null;
  audio?: LiveAudio | null;
}

/**
 * The slide's sound-bearing media, in a question's shape — what the console's
 * transport steers and what a device that hears the slide must load. Null when
 * the slide plays no sound.
 */
export function slideSoundMedia(slide: LiveSlideMedia): LiveQuestionMedia | null {
  if (slide.audio) return { visual: null, audio: slide.audio };
  const video = slide.video;
  if (!video?.sound) return null;
  return {
    visual: {
      kind: 'video',
      source: 'upload',
      url: video.url,
      gainDb: video.gainDb,
      ...(video.durationMs ? { durationMs: video.durationMs } : {}),
    },
    audio: null,
  };
}

/** The slide's video when it plays muted, else none. */
export function slideMutedVideos(slide: LiveSlideMedia): string[] {
  return slide.video && !slide.video.sound ? [slide.video.url] : [];
}

/** Whether a slide plays anything: a sound, or a video (muted or not). */
export function slideHasPlayback(slide: LiveSlideMedia): boolean {
  return !!slide.video || !!slide.audio;
}

/**
 * How long the slide's timed media play, in ms — its sound, and its video
 * when played once. A looped video is a decor: it never holds the slide. Null
 * when nothing is timed or no length is known.
 */
export function slideTimedMs(slide: LiveSlideMedia): number | null {
  const lengths: number[] = [];
  if (slide.audio?.durationMs) lengths.push(slide.audio.durationMs);
  if (slide.video && !slide.video.loop && slide.video.durationMs) {
    lengths.push(slide.video.durationMs);
  }
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
