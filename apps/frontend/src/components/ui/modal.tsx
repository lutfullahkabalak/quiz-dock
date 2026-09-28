import { cn } from '@/lib/utils';
import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';

/**
 * A native `<dialog>` shown as a modal while `open` (focus kept inside, backdrop
 * and top layer from the browser). Escape and a click on the backdrop call
 * `onClose`, and only this dialog's: one opened from another leaves that one be.
 * `m-auto`: Tailwind's reset would pin it to a corner. Falls back to the `open`
 * attribute where `showModal` is missing (jsdom in the tests).
 */
export function Modal({
  open = true,
  onClose,
  className,
  children,
  ...dialog
}: {
  /** Shown while true; a modal mounted only while shown can leave it out. */
  open?: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'dialog'>, 'open' | 'onCancel' | 'onClick' | 'className' | 'ref'>) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      try {
        if (!d.open) d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    } else if (d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      {...dialog}
      onCancel={(e) => {
        e.preventDefault(); // Escape goes through onClose, not straight to closed
        // React bubbles it through the component tree: a dialog opened from another must not close that one too.
        e.stopPropagation();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // the backdrop
      }}
      className={cn(
        'bg-background text-foreground m-auto w-[90vw] rounded-lg border p-0 shadow-lg backdrop:bg-black/50',
        className,
      )}
    >
      {children}
    </dialog>
  );
}
