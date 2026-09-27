import { describe, expect, it } from 'vitest';
import { slideShowOf } from './quiz-stage-preview';

const slide = {
  blocks: [{ type: 'heading', id: 'h', text: 'Welcome to {title}', level: 1 }],
  mediaId: null,
  gradient: null,
  videoMediaId: null,
  videoLoop: true,
  videoSound: false,
  textTone: 'light',
  textOutline: true,
  displayDelayS: null,
} as unknown as Parameters<typeof slideShowOf>[0];

describe('slideShowOf: a slide as the screens get it, stored or in the editor', () => {
  it('its picture or its gradient behind it, and its video still', () => {
    const id = '01HZX0000000000000000000AB';
    expect(slideShowOf({ ...slide, mediaId: id }, 2).background).toEqual({
      url: `/api/v1/media/${id}`,
    });
    const gradient = { from: '#000000', to: '#ffffff', angle: 90 };
    expect(slideShowOf({ ...slide, gradient } as never, 0).background).toEqual({ gradient });
    expect(slideShowOf({ ...slide, videoMediaId: id }, 0).video).toEqual({
      url: `/api/v1/media/${id}`,
      loop: true,
      sound: false,
      gainDb: 0,
    });
    expect(slideShowOf(slide, 3)).toMatchObject({ slideIndex: 3, background: null, video: null });
  });

  it("fills in the quiz's variables when it is given", () => {
    const [block] = slideShowOf(slide, 0, { title: 'Harbours' } as never).blocks as {
      text: string;
    }[];
    expect(block.text).toContain('Harbours');
  });
});
