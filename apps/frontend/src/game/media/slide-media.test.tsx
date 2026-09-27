import type { SlideShowPayload } from '@quiz-dock/contracts';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { SlideView } from '../live-components';
import { type SlidePlayback, SlidePlaybackContext } from './slide-media';

const slide = (over: Partial<SlideShowPayload> = {}): SlideShowPayload => ({
  slideIndex: 0,
  questionIndex: 0,
  blocks: [{ type: 'heading', id: 'h', text: 'Listen', level: 1 }],
  background: null,
  textTone: 'light',
  textOutline: true,
  displayDelayS: null,
  video: { url: '/api/v1/media/clip', loop: true, sound: false, gainDb: 0 },
  audio: {
    url: '/api/v1/media/song',
    durationMs: 4000,
    peaks: new Array(200).fill(0.5),
    gainDb: 0,
    size: 'M',
  },
  ...over,
});

const projection: SlidePlayback = {
  mode: 'play',
  audible: true,
  startAt: null,
  anchor: null,
  resumeKey: null,
};

let played: HTMLMediaElement[];
beforeEach(() => {
  played = [];
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLMediaElement,
  ) {
    played.push(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const show = (value: SlidePlayback, s = slide()) =>
  render(
    <SlidePlaybackContext.Provider value={value}>
      <SlideView slide={s} />
    </SlidePlaybackContext.Provider>,
  );

describe('SlideView with media (#125)', () => {
  it('the projection plays the sound, and the video behind the content — looped, muted', async () => {
    const { container } = show(projection);
    await waitFor(() => expect(played).toHaveLength(2));
    const video = container.querySelector('video')!;
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.className).toContain('object-cover');
    const audio = played.find((el) => el.tagName === 'AUDIO')!;
    expect(audio.muted).toBe(false);
    expect(container.querySelector('canvas')).not.toBeNull(); // the M waveform
  });

  it('a phone in the room: no video, and the sound only drawn where the projection is', async () => {
    const { container } = show({ ...projection, audible: false, videos: false, follow: null });
    await act(async () => undefined);
    expect(container.querySelector('video')).toBeNull();
    expect(played).toHaveLength(0);
  });

  it('builds nothing that plays without a playback (the builder, a preview)', async () => {
    const { container } = render(<SlideView slide={slide()} />);
    await act(async () => undefined);
    expect(played).toHaveLength(0);
    expect(container.querySelector('video')).not.toBeNull(); // its first frame, still
  });

  it('a hidden waveform is drawn on the console only', async () => {
    const hidden = slide({ audio: { ...slide().audio!, size: 'hidden' }, video: null });
    const screen = show({ ...projection, mode: 'still', audible: false, follow: null }, hidden);
    expect(screen.container.querySelector('canvas')).toBeNull();
    cleanup();
    const consoleView = show(
      { ...projection, mode: 'still', audible: false, follow: null, showHidden: true },
      hidden,
    );
    expect(consoleView.container.querySelector('canvas')).not.toBeNull();
  });
});
