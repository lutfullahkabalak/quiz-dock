import { useNavigate } from '@tanstack/react-router';
import { Check, Loader2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { errorText } from '../api/error-text';
import { type SessionPeek, peekSession } from '../game/game-client';
import { roomLabel } from '../game/room-components';

const PIN_LENGTH = 6;

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'found'; peek: SessionPeek }
  | { state: 'failed'; message: string };

/**
 * The one way into a room (UI system §4), on the home page and on `/join`: six
 * digit boxes over one real field (numeric keypad, paste), the PIN checked as soon
 * as its 6th digit is in — the room's name then shows, or what is wrong, under
 * the boxes. Joining itself happens on `/join/$pin`.
 */
export function JoinPin({ autoFocus = false }: { autoFocus?: boolean }) {
  const { t } = useTranslation(['join', 'live', 'errors']);
  const navigate = useNavigate();
  const id = useId();
  const [pin, setPin] = useState('');
  const [focused, setFocused] = useState(false);
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  useEffect(() => {
    if (pin.length < PIN_LENGTH) {
      setCheck({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setCheck({ state: 'checking' });
    peekSession(pin)
      .then((peek) => !cancelled && setCheck({ state: 'found', peek }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = (err as { code?: string }).code;
        setCheck({
          state: 'failed',
          // A wrong PIN is the usual case: said with where to look.
          message:
            code === 'session.not_found'
              ? t('notFound')
              : err instanceof Error
                ? err.message
                : errorText('error'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [pin, t]);

  const go = (e?: FormEvent) => {
    e?.preventDefault();
    if (check.state === 'found') void navigate({ to: '/join/$pin', params: { pin } });
  };
  const failed = check.state === 'failed';
  const found = check.state === 'found' ? check.peek : null;

  return (
    <form className="qd-pin-form flex w-full flex-col items-center gap-4" onSubmit={go}>
      <label htmlFor={id} className="text-muted-foreground text-sm">
        {t('hint')}
      </label>
      {/* One real field under six drawn boxes: the keypad, paste and autofill all work. */}
      <div className="relative w-full">
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                'bg-background flex aspect-[3/4] items-center justify-center rounded-lg border-2 text-2xl font-bold tabular-nums',
                failed
                  ? 'border-destructive'
                  : i < pin.length
                    ? 'border-primary'
                    : focused && i === pin.length
                      ? 'border-primary ring-primary/35 ring-[3px]'
                      : 'border-input',
              )}
            >
              {pin[i] ?? ''}
            </span>
          ))}
        </div>
        <input
          id={id}
          autoFocus={autoFocus}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={PIN_LENGTH}
          aria-label={t('pinLabel')}
          aria-invalid={failed || undefined}
          aria-describedby={`${id}-state`}
          className="absolute inset-0 h-full w-full cursor-text text-base opacity-0"
        />
      </div>
      <div
        id={`${id}-state`}
        className="flex min-h-10 w-full flex-col items-center gap-3"
        role="status"
      >
        {check.state === 'checking' ? (
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('checking')}
          </span>
        ) : failed ? (
          <p className="text-destructive text-sm font-semibold">{check.message}</p>
        ) : found ? (
          <>
            <p className="bg-muted flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm">
              <Check className="text-success size-4 shrink-0" aria-hidden />
              <span>
                <b>{roomLabel(t, found.roomName, found.hostName)}</b>
                {found.quizTitle ? ` · ${found.quizTitle}` : null}
              </span>
            </p>
            {found.joinLocked ? <p className="text-warning-text text-sm">{t('locked')}</p> : null}
            <Button type="submit" size="lg" className="w-full">
              {t('continue')}
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">{t('checkedAt6')}</span>
        )}
      </div>
    </form>
  );
}
