import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { type SlideMediaValue, SlideMediaField } from './slide-media-field';

// The upload itself has its own tests: here, a button standing for the pick.
vi.mock('./media-upload', () => ({
  MediaUpload: ({
    kind,
    value,
    onChange,
  }: {
    kind: string;
    value: string | null;
    onChange: (id: string | null, uploaded?: { peaks?: number[] }) => void;
  }) => (
    <button type="button" data-testid={`upload-${kind}`} onClick={() => onChange(`${kind}-id`, {})}>
      {value ?? 'empty'}
    </button>
  ),
}));

afterEach(cleanup);

const base: SlideMediaValue = {
  videoMediaId: null,
  videoLoop: true,
  videoSound: true,
  audioMediaId: null,
  waveformSize: 'hidden',
  audioTarget: null,
};

const open = (value: SlideMediaValue, onChange = vi.fn()) => {
  render(<SlideMediaField value={value} onChange={onChange} peaks={null} onPeaks={vi.fn()} />);
  // A fold: its content is in the page, open or not.
  return onChange;
};

describe('SlideMediaField (#125)', () => {
  it('a video with its sound closes the sound, and says why', () => {
    open({ ...base, videoMediaId: 'v' });
    expect(screen.queryByTestId('upload-audio')).toBeNull();
    expect(screen.getByText(i18n.t('editor:slideForm.videoSoundExcludesAudio'))).toBeTruthy();
  });

  it('a video picked next to a sound comes muted: one sound at a time', () => {
    const onChange = open({ ...base, audioMediaId: 'a' });
    fireEvent.click(screen.getByTestId('upload-video'));
    expect(onChange).toHaveBeenCalledWith({ videoMediaId: 'video-id', videoSound: false });
  });

  it("a muted video's sound cannot be turned on while the slide has one", () => {
    open({ ...base, videoMediaId: 'v', videoSound: false, audioMediaId: 'a' });
    const sound = screen.getByRole('checkbox', {
      name: new RegExp(`^${i18n.t('editor:slideForm.videoSound')}`),
    });
    expect((sound as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('upload-audio')).toBeTruthy();
  });
});
