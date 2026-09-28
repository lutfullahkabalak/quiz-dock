import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * The top of an editor form, kept in view (a long form would push saving out of
 * reach): what is being edited, a refusal next to the button that caused it,
 * Cancel and Save. Cancel asks first when there are changes, then `onCancel`.
 */
export function FormActionBar({
  title,
  error,
  dirty,
  busy,
  submitLabel,
  onCancel,
}: {
  title: string;
  /** Shown in the bar when given (a form that says its errors elsewhere leaves it out). */
  error?: string | null;
  dirty: boolean;
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation('editor');
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="bg-background/95 sticky top-0 z-20 -mx-1 flex items-center gap-2 px-1 py-2 backdrop-blur">
        {/* Out of a drawer the form has no title: the bar says what is being edited. */}
        <span
          className={
            error === undefined
              ? 'mr-auto min-w-0 truncate text-base font-semibold'
              : 'min-w-0 truncate text-base font-semibold'
          }
        >
          {title}
        </span>
        {error !== undefined ? (
          <p className="text-destructive mr-auto min-w-0 flex-1 truncate text-xs">{error}</p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => (dirty ? setConfirm(true) : onCancel())}
        >
          {t('common:cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || busy}>
          {submitLabel}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        destructive
        title={t('discardConfirm.title')}
        description={t('discardConfirm.description')}
        confirmLabel={t('discardConfirm.confirmLabel')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onCancel();
        }}
      />
    </>
  );
}
