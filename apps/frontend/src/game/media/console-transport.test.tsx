import type { LiveQuestionMedia } from '@quiz-dock/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { ConsoleTransport } from './console-transport';

const sound: LiveQuestionMedia = {
  visual: null,
  audio: {
    url: '/api/v1/media/a',
    durationMs: 10_000,
    peaks: new Array(200).fill(0.5),
    gainDb: 0,
    size: 'M',
  },
};

afterEach(() => cleanup());

// jsdom has no PointerEvent: a mouse event carries the position the drag reads.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.assign(window, { PointerEvent });
}

const slider = () => {
  const el = screen.getByRole('slider');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 100,
    top: 0,
    height: 10,
    right: 100,
    bottom: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return el;
};

describe('ConsoleTransport', () => {
  it('a drag on the waveform sends one seek, at the release', () => {
    const onCommand = vi.fn();
    render(
      <ConsoleTransport
        media={sound}
        follow={{ questionIndex: 0, t: 2, playing: true, receivedAt: performance.now() }}
        listening={false}
        gamePaused={false}
        onCommand={onCommand}
        onGamePause={vi.fn()}
      />,
    );
    const bar = slider();
    fireEvent.pointerDown(bar, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 60, pointerId: 1 });
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.pointerUp(bar, { clientX: 70, pointerId: 1 });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ action: 'seek', t: 7, playing: true });

    // Pause from where it stands.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'pause' }));
  });

  it('while the sound is listened to, the point stays and play / pause is the game’s pause', () => {
    const onCommand = vi.fn();
    const onGamePause = vi.fn();
    render(
      <ConsoleTransport
        media={sound}
        follow={null}
        listening
        gamePaused={false}
        onCommand={onCommand}
        onGamePause={onGamePause}
      />,
    );
    const bar = slider();
    expect(bar).toHaveAttribute('aria-disabled', 'true');
    fireEvent.pointerDown(bar, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 50, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(onGamePause).toHaveBeenCalledWith(true);
    // Back to the top stays possible.
    fireEvent.click(screen.getByRole('button', { name: /Relancer|Restart/ }));
    expect(onCommand).toHaveBeenCalledWith({ action: 'restart' });
  });

  it('with no projection open, it goes by the host’s last command', () => {
    const { rerender } = render(
      <ConsoleTransport
        media={sound}
        follow={null}
        anchor={{ t: 4, at: Date.now(), playing: false, receivedAt: performance.now() }}
        listening={false}
        gamePaused={false}
        onCommand={vi.fn()}
        onGamePause={vi.fn()}
      />,
    );
    // Held at 0:04: the button offers to play, not to pause again.
    expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '4');
    rerender(
      <ConsoleTransport
        media={sound}
        follow={{ questionIndex: 0, t: 1, playing: false, receivedAt: performance.now() - 5000 }}
        anchor={{ t: 6, at: Date.now(), playing: false, receivedAt: performance.now() }}
        listening={false}
        gamePaused={false}
        onCommand={vi.fn()}
        onGamePause={vi.fn()}
      />,
    );
    // The projection's older word loses to the newer anchor.
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '6');
  });

  it('arrows move the point while held, one command when let go', () => {
    const onCommand = vi.fn();
    render(
      <ConsoleTransport
        media={sound}
        follow={{ questionIndex: 0, t: 2, playing: false, receivedAt: performance.now() }}
        listening={false}
        gamePaused={false}
        onCommand={onCommand}
        onGamePause={vi.fn()}
      />,
    );
    const bar = screen.getByRole('slider');
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.keyDown(bar, { key: 'ArrowRight', repeat: true });
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.keyUp(bar, { key: 'ArrowRight' });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ action: 'seek', t: 10, playing: false });
  });
});
