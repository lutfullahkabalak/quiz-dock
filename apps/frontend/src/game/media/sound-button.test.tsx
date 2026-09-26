import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { resetMixerForTests, useDeviceSound } from './audio-mixer';
import { SoundButton } from './sound-button';
import { SoundUnlockOverlay } from './sound-unlock-overlay';

vi.mock('./audio-unlock', () => ({
  unlockAudio: vi.fn(() => Promise.resolve(true)),
  audioContext: () => null,
  isAudioUnlocked: () => true,
}));

/** Shows the device's mute, so a test reads what the button did. */
function Probe() {
  const { muted, volume } = useDeviceSound();
  return <output data-testid="probe">{`${muted ? 'muted' : 'on'} ${volume}`}</output>;
}

const pointer = (hover: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: hover, addEventListener: () => undefined })),
  );

describe('SoundButton (SPECIFICATIONS-MEDIA §9.2)', () => {
  beforeEach(() => resetMixerForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('with a mouse, a click mutes, hovering shows the volume and the mixer', () => {
    pointer(true);
    const onUnmute = vi.fn();
    render(
      <>
        <SoundButton onUnmute={onUnmute} />
        <Probe />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Couper le son' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('muted');
    fireEvent.click(screen.getByRole('button', { name: 'Activer le son' }));
    expect(onUnmute).toHaveBeenCalled(); // turning the sound on unlocks what the browser holds
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Couper le son' }).parentElement!);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '40' } });
    expect(screen.getByTestId('probe')).toHaveTextContent('on 0.4');
  });

  it('on a phone, a tap opens the panel; the mixer trims each bus of this device', () => {
    pointer(false);
    render(<SoundButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Couper le son' }));
    fireEvent.click(screen.getByRole('button', { name: /Mixer/ }));
    for (const bus of ['Questions', 'Musique', 'Effets', 'Interface']) {
      expect(screen.getByRole('slider', { name: bus })).toBeInTheDocument();
    }
  });

  it('the unlocking overlay can be declined: the click still counts, the screen stays muted', () => {
    render(
      <>
        <SoundUnlockOverlay />
        <Probe />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sans le son' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('muted');
  });
});
