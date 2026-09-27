import { describe, expect, it } from 'vitest';
import { promptImage } from './prompt-image';

const ID = '01M3GM8JMFRA3DJ04SWWDWPPBY';

describe('promptImage', () => {
  it('finds the first library image, and the prompt without it', () => {
    expect(promptImage(`Quelle ville ?\n\n![La tour Eiffel](/api/v1/media/${ID})`)).toEqual({
      mediaId: ID,
      alt: 'La tour Eiffel',
      rest: 'Quelle ville ?',
    });
  });

  it('tidies the text where the image was, a Markdown line break kept', () => {
    expect(promptImage(`Ligne  \ncassée, puis ![a](/api/v1/media/${ID}) fin`)?.rest).toBe(
      'Ligne  \ncassée, puis fin',
    );
  });

  it('only the first image; none without one, nor for an image from elsewhere', () => {
    const two = `![a](/api/v1/media/${ID}) et ![b](/api/v1/media/01M3GM8JN71KRDGBYGM364TDPK)`;
    expect(promptImage(two)?.rest).toBe('et ![b](/api/v1/media/01M3GM8JN71KRDGBYGM364TDPK)');
    expect(promptImage('Pas d’image')).toBeNull();
    expect(promptImage('![x](https://example.com/a.png)')).toBeNull();
  });
});
