import type { LiveQuestionMedia } from '@quiz-dock/contracts';
import type { QuizSnapshot, SnapshotQuestion } from './game.types';
import {
  firstStepOf,
  mediaForDevice,
  preloadFor,
  slideMediaForDevice,
  snapshotHasMedia,
  stepAfterSlide,
} from './preload';
import type { SnapshotSlide } from './game.types';

const image = { kind: 'image', url: '/img', alt: null } as const;
const video = { kind: 'video', source: 'upload', url: '/vid', gainDb: 0 } as const;
const audio = { url: '/snd', durationMs: 1000, peaks: [], gainDb: 0 };
const withSound: LiveQuestionMedia = { visual: image, audio };
const withVideo: LiveQuestionMedia = { visual: video, audio: null };

describe('mediaForDevice', () => {
  it('gives a screen everything', () => {
    expect(mediaForDevice(withSound, 'projection', 'screen')).toEqual(withSound);
  });

  it('gives a remote participant the visual, and the sound when it is theirs', () => {
    expect(mediaForDevice(withSound, 'projection_remote', 'remote')).toEqual(withSound);
    expect(mediaForDevice(withSound, 'projection', 'remote')).toEqual({
      visual: image,
      audio: null,
    });
    // A remote phone shows the video, muted when its sound is not for them.
    expect(mediaForDevice(withVideo, 'projection', 'remote')).toEqual(withVideo);
  });

  it('gives a phone in the room the image only, unless the sound is for every device', () => {
    expect(mediaForDevice(withSound, 'projection_remote', 'room')).toEqual({
      visual: image,
      audio: null,
    });
    expect(mediaForDevice(withVideo, 'projection_remote', 'room')).toEqual({
      visual: null,
      audio: null,
    });
    expect(mediaForDevice(withVideo, 'everyone', 'room')).toEqual(withVideo);
  });
});

describe('preloadFor', () => {
  const question = (
    media: LiveQuestionMedia,
    audioTarget: SnapshotQuestion['audioTarget'] = null,
  ) => ({ media, audioTarget }) as SnapshotQuestion;
  const snapshot = {
    audioTarget: 'projection_remote',
    questions: [question(withSound), question({ visual: null, audio: null })],
    slides: [
      {
        beforeQuestionIndex: 0,
        background: { url: '/bg' },
        blocks: [
          {
            type: 'columns',
            id: 'c',
            columns: [
              [
                {
                  type: 'image',
                  id: 'i',
                  mediaId: 'm',
                  url: '/slide-img',
                  size: 'small',
                  align: 'left',
                },
              ],
            ],
          },
        ],
      },
    ],
  } as unknown as QuizSnapshot;

  it('names the question and its target — nothing else', () => {
    expect(preloadFor(snapshot, { questionIndex: 0 }, 'projection_remote', 'remote')).toEqual({
      questionIndex: 0,
      media: withSound,
      audioTarget: 'projection_remote',
    });
  });

  it("names a slide's images, and those of the slides after it on the same anchor", () => {
    expect(
      preloadFor(snapshot, { questionIndex: 0, slideIndex: 0 }, 'projection_remote', 'room'),
    ).toEqual({
      questionIndex: 0,
      slideIndex: 0,
      media: { visual: null, audio: null },
      images: ['/bg', '/slide-img'],
    });
  });

  it('has nothing to say when there is nothing to fetch', () => {
    expect(preloadFor(snapshot, { questionIndex: 1 }, 'projection_remote', 'room')).toBeNull();
    expect(preloadFor(snapshot, { questionIndex: 2 }, 'projection_remote', 'screen')).toBeNull();
  });

  it('walks the steps: the slides before a question, then the question', () => {
    expect(firstStepOf(snapshot, 0)).toEqual({ questionIndex: 0, slideIndex: 0 });
    expect(stepAfterSlide(snapshot, 0)).toEqual({ questionIndex: 0 });
    expect(firstStepOf(snapshot, 1)).toEqual({ questionIndex: 1 });
    expect(firstStepOf(snapshot, 2)).toBeNull();
  });

  it('tells whether the quiz has anything to fetch at all', () => {
    expect(snapshotHasMedia(snapshot)).toBe(true);
    expect(snapshotHasMedia({ ...snapshot, questions: [], slides: [] })).toBe(false);
  });
});

describe('slideMediaForDevice (#125)', () => {
  const slide = {
    beforeQuestionIndex: 0,
    background: null,
    backgroundVideo: { url: '/bg.mp4', loop: true, sound: false, gainDb: 0 },
    blocks: [
      { type: 'audio', id: 'a', mediaId: 'm', url: '/song.m4a', size: 'M', durationMs: 5000 },
      {
        type: 'video',
        id: 'v',
        mediaId: 'n',
        url: '/clip.mp4',
        size: 'large',
        align: 'center',
        sound: false,
      },
    ],
  } as unknown as SnapshotSlide;
  const song = expect.objectContaining({ url: '/song.m4a' });

  it('gives a screen the sound and every muted video', () => {
    const own = slideMediaForDevice(slide, 'projection', 'screen');
    expect(own.media.audio).toEqual(song);
    expect(own.videos).toEqual(['/clip.mp4', '/bg.mp4']);
  });

  it('gives a remote participant the videos, and the sound only when it is theirs', () => {
    expect(slideMediaForDevice(slide, 'projection', 'remote')).toEqual({
      media: { visual: null, audio: null },
      videos: ['/clip.mp4', '/bg.mp4'],
    });
    expect(slideMediaForDevice(slide, 'projection_remote', 'remote').media.audio).toEqual(song);
  });

  it('gives a phone in the room no video, and the sound only when it is for every device', () => {
    expect(slideMediaForDevice(slide, 'projection_remote', 'room')).toEqual({
      media: { visual: null, audio: null },
      videos: [],
    });
    const everyone = slideMediaForDevice(slide, 'everyone', 'room');
    expect(everyone.media.audio).toEqual(song);
    expect(everyone.videos).toEqual([]);
  });
});
