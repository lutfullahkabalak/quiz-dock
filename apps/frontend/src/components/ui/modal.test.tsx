import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

describe('Modal', () => {
  it('opens while open, and closes by Escape or its backdrop, not by a click inside', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} aria-label="Files">
        <button type="button">Inside</button>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Files' });
    expect(dialog).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog); // the backdrop is the dialog itself
    fireEvent(dialog, new Event('cancel', { cancelable: true })); // Escape
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(
      <Modal open={false} onClose={onClose} aria-label="Files">
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a modal opened from another closes alone on Escape', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <Modal onClose={outer} aria-label="Library">
        <Modal onClose={inner} aria-label="Delete?">
          <p>Sure?</p>
        </Modal>
      </Modal>,
    );
    fireEvent(
      screen.getByRole('dialog', { name: 'Delete?' }),
      new Event('cancel', { cancelable: true }),
    );
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
