import { cn } from '@/lib/utils';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button';
import { Modal } from './modal';

/**
 * Modal de confirmation (sur `Modal`, pas `confirm()`) : un titre, un texte, les
 * deux actions. Contrôlée par `open` ; Échap et le fond valent « annuler ».
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  confirmDisabled,
  wide,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** The confirm button waits until what the dialog asks for is right. */
  confirmDisabled?: boolean;
  /** Room for more than a sentence (a list to pick from). */
  wide?: boolean;
  /** Contenu additionnel (ex. case à cocher) inséré entre le texte et les actions. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('common');
  const titleId = useId();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      aria-labelledby={titleId}
      // Wide (a list inside): never taller than the viewport; the list takes what is left.
      className={wide ? 'max-h-[calc(100dvh-2rem)] max-w-2xl open:flex open:flex-col' : 'max-w-md'}
    >
      <div className={cn('flex flex-col gap-4 p-6', wide && 'min-h-0 flex-1 overflow-y-auto')}>
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        {children}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
