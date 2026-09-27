import type { HostMediaCommand, LiveQuestionMedia, MediaAnchor } from '@quiz-dock/contracts';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { serverNow } from '../clock';
import type { FollowedPosition } from './question-media-stage';
import { Waveform } from './waveform';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Command = Omit<HostMediaCommand, 'pin'>;

/**
 * The host's hand on the question's media, from the console: play / pause, the
 * sound's waveform to click or drag to a point, and back to the top. The console
 * plays nothing itself: it draws where the projection is, and every device that
 * plays the media follows the command. While a listen-first question plays before
 * its answers open, the point cannot move (the answers open on a time fixed from
 * the sound) and play / pause is the game's own pause.
 */
export function ConsoleTransport({
  media,
  follow,
  anchor = null,
  listening,
  gamePaused,
  onCommand,
  onGamePause,
}: {
  media: LiveQuestionMedia;
  follow: FollowedPosition | null;
  /**
   * The host's last command, as the server anchored it: what the console goes by
   * when it is newer than the projection's word — or when no projection is open.
   */
  anchor?: (MediaAnchor & { receivedAt: number }) | null;
  /** A listen-first question, before its answers open. */
  listening: boolean;
  gamePaused: boolean;
  onCommand: (command: Command) => void;
  onGamePause: (paused: boolean) => void;
}) {
  const { t } = useTranslation(['live', 'common']);
  const audio = media.audio;
  const durationS =
    (audio?.durationMs ??
      (media.visual?.kind === 'video' && 'durationMs' in media.visual
        ? (media.visual.durationMs ?? 0)
        : 0)) / 1000;
  // The newer word wins: the projection's position, or the host's last anchor.
  const byAnchor = !!anchor && (!follow || anchor.receivedAt > follow.receivedAt);
  // Until either says otherwise, the media plays with the game.
  const playing = listening
    ? !gamePaused
    : byAnchor
      ? anchor!.playing && !gamePaused
      : (follow?.playing ?? !gamePaused);

  // Where the projection is, moved on while it plays; a drag or a fresh seek shows
  // its own point until the projection's next word.
  const [now, setNow] = useState(() => performance.now());
  const moving = byAnchor ? playing : !!follow?.playing;
  useEffect(() => {
    if (!moving) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  const followedT = byAnchor
    ? Math.min(durationS, anchor!.t + (playing ? Math.max(0, serverNow() - anchor!.at) / 1000 : 0))
    : follow
      ? Math.min(durationS, follow.t + (follow.playing ? (now - follow.receivedAt) / 1000 : 0))
      : 0;
  const [pending, setPending] = useState<{ t: number; since: number } | null>(null);
  // The projection spoke, or the server anchored the command, after the seek: that word wins.
  useEffect(() => {
    const latest = Math.max(follow?.receivedAt ?? 0, anchor?.receivedAt ?? 0);
    if (pending && latest > pending.since) setPending(null);
  }, [follow, anchor, pending]);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? pending?.t ?? followedT;

  const seek = (to: number) => {
    const target = Math.min(Math.max(to, 0), durationS);
    setPending({ t: target, since: performance.now() });
    onCommand({ action: 'seek', t: target, playing });
  };
  const toggle = () => {
    if (listening) onGamePause(!gamePaused);
    else onCommand({ action: playing ? 'pause' : 'play', t: shown });
  };
  const restart = () => {
    setPending({ t: 0, since: performance.now() });
    onCommand({ action: 'restart' });
  };

  const bar = useRef<HTMLDivElement>(null);
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = bar.current!.getBoundingClientRect();
    if (!Number.isFinite(e.clientX) || box.width <= 0) return shown;
    return (Math.min(Math.max(e.clientX - box.left, 0), box.width) / box.width) * durationS;
  };
  const canSeek = !!audio && !listening && durationS > 0;

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2 self-center">
      {audio ? (
        <div className="flex w-full items-center gap-3">
          <div
            ref={bar}
            role="slider"
            tabIndex={canSeek ? 0 : -1}
            aria-label={t('common:position')}
            aria-disabled={!canSeek}
            aria-valuemin={0}
            aria-valuemax={Math.round(durationS)}
            aria-valuenow={Math.round(shown)}
            aria-valuetext={`${clock(shown)} / ${clock(durationS)}`}
            title={listening ? t('control.seekListening') : undefined}
            className={
              canSeek
                ? 'text-primary focus-visible:ring-primary min-w-0 flex-1 cursor-pointer touch-none rounded focus-visible:ring-2 focus-visible:outline-none'
                : 'text-primary min-w-0 flex-1 cursor-not-allowed opacity-70'
            }
            onPointerDown={(e) => {
              if (!canSeek) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setDrag(at(e));
            }}
            onPointerMove={(e) => {
              if (drag !== null) setDrag(at(e));
            }}
            // One command at the release: every playing device seeks on each one.
            onPointerUp={(e) => {
              if (drag === null) return;
              setDrag(null);
              seek(at(e));
            }}
            onPointerCancel={() => setDrag(null)}
            // Arrows move the point while held; one command when the key is let go.
            onKeyDown={(e) => {
              if (!canSeek || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
              e.preventDefault();
              const step = e.key === 'ArrowRight' ? 5 : -5;
              setDrag((d) => Math.min(Math.max((d ?? shown) + step, 0), durationS));
            }}
            onKeyUp={(e) => {
              if (drag === null || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
              setDrag(null);
              seek(drag);
            }}
          >
            {/* Drawn here even when the author hid it from the screens. */}
            <Waveform
              peaks={audio.peaks}
              progress={durationS ? shown / durationS : 0}
              size={audio.size === 'L' ? 'L' : 'M'}
              label={t('media.waveform')}
            />
          </div>
          <span className="text-muted-foreground w-20 shrink-0 text-right text-xs tabular-nums">
            {clock(shown)} / {clock(durationS)}
          </span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggle}
          aria-label={playing ? t('common:pause') : t('common:play')}
          title={listening ? t('control.pauseListening') : undefined}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? t('common:pause') : t('common:play')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={restart}>
          <RotateCcw className="size-4" />
          {t('control.restartMedia')}
        </Button>
      </div>
    </div>
  );
}
