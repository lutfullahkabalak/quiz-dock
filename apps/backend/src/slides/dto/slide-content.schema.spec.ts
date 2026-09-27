import { slideContentSchema } from './slide-content.schema';

describe('slideContentSchema', () => {
  it('text outline is on by default (readable over any background)', () => {
    const parsed = slideContentSchema.parse({
      blocks: [{ type: 'heading', id: 'h', text: 'Hello' }],
    });
    expect(parsed.textOutline).toBe(true);
    expect(parsed.textTone).toBe('light');
  });

  it('refuses an empty slide and a double background', () => {
    expect(slideContentSchema.safeParse({}).success).toBe(false);
    expect(
      slideContentSchema.safeParse({
        mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        gradient: { angle: 0, colors: ['#000000', '#ffffff'] },
      }).success,
    ).toBe(false);
  });

  it('one sound at a time: a video with its own excludes the sound (#125)', () => {
    const VID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const SND = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
    const both = slideContentSchema.safeParse({ videoMediaId: VID, audioMediaId: SND });
    expect(both.success).toBe(false);
    expect(both.error?.issues[0].message).toBe('slide.two_sounds');
    const muted = slideContentSchema.parse({
      videoMediaId: VID,
      videoSound: false,
      audioMediaId: SND,
    });
    // A video alone is enough to show; looped by default, the waveform hidden.
    expect(muted).toMatchObject({ videoLoop: true, waveformSize: 'hidden' });
  });
});
