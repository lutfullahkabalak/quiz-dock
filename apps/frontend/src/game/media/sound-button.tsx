import { SlidersHorizontal, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BUSES,
  setDeviceMuted,
  setDeviceVolume,
  setLocalTrim,
  useDeviceSound,
} from './audio-mixer';

/** Whether this screen hovers (a mouse); a phone taps instead. */
const canHover = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

/**
 * This device's sound (SPECIFICATIONS-MEDIA §9.2): the classic speaker. With a
 * mouse, a click mutes or unmutes and hovering shows the volume and the way to
 * the mixer; on a phone, a tap opens them (one tap more, on purpose). Turning
 * the sound on is a gesture: `onUnmute` unlocks what the browser still holds.
 */
export function SoundButton({
  onUnmute,
  className,
  size = 'sm',
}: {
  onUnmute?: () => void;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const { t } = useTranslation('live');
  const sound = useDeviceSound();
  const [open, setOpen] = useState(false);
  const [mixer, setMixer] = useState(false);
  const hover = canHover();
  const Icon = sound.muted || sound.volume === 0 ? VolumeX : sound.volume < 0.5 ? Volume1 : Volume2;
  const toggle = () => {
    if (sound.muted) onUnmute?.();
    setDeviceMuted(!sound.muted);
  };

  return (
    <div
      className={cn('relative', className)}
      onMouseEnter={hover ? () => setOpen(true) : undefined}
      onMouseLeave={hover ? () => setOpen(false) : undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={size === 'lg' ? 'size-10' : 'size-8'}
        aria-pressed={sound.muted}
        aria-expanded={open}
        aria-label={sound.muted ? t('sound.unmute') : t('sound.mute')}
        title={sound.muted ? t('sound.unmute') : t('sound.mute')}
        onClick={hover ? toggle : () => setOpen(!open)}
      >
        <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />
      </Button>
      {open ? (
        <div className="bg-background absolute top-full right-0 z-50 flex w-56 flex-col gap-2 rounded-lg border p-3 text-sm shadow-lg">
          {hover ? null : (
            // On a phone the button opened this: the mute is here.
            <Button type="button" variant="outline" size="sm" onClick={toggle}>
              <Icon className="size-4" />
              {sound.muted ? t('sound.unmute') : t('sound.mute')}
            </Button>
          )}
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{t('sound.volume')}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              aria-label={t('sound.volume')}
              value={Math.round(sound.volume * 100)}
              onChange={(e) => {
                if (sound.muted) {
                  onUnmute?.();
                  setDeviceMuted(false);
                }
                setDeviceVolume(Number(e.target.value) / 100);
              }}
              className="accent-primary flex-1"
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              setMixer(true);
            }}
          >
            <SlidersHorizontal className="size-4" />
            {t('sound.mixer')}
          </Button>
        </div>
      ) : null}
      <SimpleDialog open={mixer} title={t('sound.mixerTitle')} onClose={() => setMixer(false)}>
        <p className="text-muted-foreground text-sm">{t('sound.mixerHint')}</p>
        {BUSES.map((bus) => (
          <label key={bus} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0">{t(`sound.bus.${bus}`)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              aria-label={t(`sound.bus.${bus}`)}
              value={Math.round(sound.trims[bus] * 100)}
              onChange={(e) => setLocalTrim(bus, Number(e.target.value) / 100)}
              className="accent-primary flex-1"
            />
            <span className="w-10 text-right text-xs tabular-nums">
              {Math.round(sound.trims[bus] * 100)} %
            </span>
          </label>
        ))}
      </SimpleDialog>
    </div>
  );
}

/** A plain modal with a title and a close button (native `<dialog>`, centred). */
export function SimpleDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('common');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      try {
        if (!d.open) d.showModal();
      } catch {
        d.setAttribute('open', ''); // jsdom
      }
    } else if (d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="bg-background text-foreground m-auto w-[90vw] max-w-md rounded-lg border p-0 shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('close')}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
