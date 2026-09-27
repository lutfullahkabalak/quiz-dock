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

  it('refuses two blocks playing sound, columns included (#125)', () => {
    const sound = { type: 'audio', id: 'a', mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' };
    const video = (id: string, sound?: boolean) => ({
      type: 'video',
      id,
      mediaId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      ...(sound === undefined ? {} : { sound }),
    });
    const parse = (blocks: unknown[]) => slideContentSchema.safeParse({ blocks });
    expect(parse([sound, video('v', false)]).success).toBe(true);
    // A video block keeps its sound unless told otherwise.
    const twice = parse([sound, { type: 'columns', id: 'c', columns: [[video('v')], []] }]);
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0].message).toBe('slide.two_sounds');
  });
});
