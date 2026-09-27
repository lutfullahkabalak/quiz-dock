import {
  AUDIO_TARGETS,
  type AudioTarget,
  WAVEFORM_SIZES,
  type WaveformSize,
} from '@quiz-dock/contracts';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui/disclosure';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Waveform } from '../game/media/waveform';
import { MediaUpload } from './media-upload';

export interface SlideMediaValue {
  videoMediaId: string | null;
  videoLoop: boolean;
  videoSound: boolean;
  audioMediaId: string | null;
  waveformSize: WaveformSize;
  audioTarget: AudioTarget | null;
}

/**
 * A slide's media (#125), laid out as a question's: the video and the sound side
 * by side, each a group of its own. The video fills the slide behind its content;
 * with its sound on, it excludes the sound — as a question's video does — and
 * each side says why. Muted, it goes with a sound.
 */
export function SlideMediaField({
  value,
  onChange,
  peaks,
  onPeaks,
}: {
  value: SlideMediaValue;
  onChange: (patch: Partial<SlideMediaValue>) => void;
  /** The sound's waveform when known (a sound picked here), for the size preview. */
  peaks: number[] | null;
  onPeaks: (peaks: number[] | null) => void;
}) {
  const { t } = useTranslation('editor');
  const { videoMediaId, videoSound, audioMediaId } = value;
  const videoTakesSound = !!videoMediaId && videoSound;
  const hasSound = videoTakesSound || !!audioMediaId;

  return (
    <Disclosure
      title={t('slideForm.mediaLegend')}
      value={
        [videoMediaId ? t('media.kindVideo') : null, audioMediaId ? t('media.audioLabel') : null]
          .filter(Boolean)
          .join(' · ') || t('media.none')
      }
    >
      <div className={GROUP}>
        <span className="text-sm font-medium">{t('media.kindVideo')}</span>
        <MediaUpload
          value={videoMediaId}
          // Picked next to a sound, it comes muted: one sound at a time.
          onChange={(id) =>
            onChange({ videoMediaId: id, ...(id && audioMediaId ? { videoSound: false } : {}) })
          }
          kind="video"
          label={t('media.addVideo')}
        />
        {videoMediaId ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs">{t('slideForm.videoCover')}</p>
            <Switch
              checked={value.videoLoop}
              onChange={(v) => onChange({ videoLoop: v })}
              label={t('slideForm.videoLoop')}
              hint={t('slideForm.videoLoopHint')}
            />
            <Switch
              checked={videoSound}
              // Its own sound needs the slide's to go; the builder asks before, as for a question.
              disabled={!!audioMediaId && !videoSound}
              onChange={(v) => onChange({ videoSound: v })}
              label={t('slideForm.videoSound')}
              hint={
                !!audioMediaId && !videoSound
                  ? t('slideForm.audioExcludesVideoSound')
                  : t('slideForm.videoSoundHint')
              }
            />
          </div>
        ) : null}
      </div>

      <div className={GROUP}>
        <span className="text-sm font-medium">{t('media.audioLabel')}</span>
        {videoTakesSound ? (
          <p className="text-muted-foreground text-sm">{t('slideForm.videoSoundExcludesAudio')}</p>
        ) : (
          <MediaUpload
            value={audioMediaId}
            onChange={(id, uploaded) => {
              onChange({ audioMediaId: id });
              onPeaks(id ? (uploaded?.peaks ?? null) : null);
            }}
            kind="audio"
            label={t('media.addAudio')}
          />
        )}
        {hasSound ? (
          <Label title={t('questionForm.audioTargetHint')}>
            {t('questionForm.audioTargetLabel')}
            <Select
              value={value.audioTarget ?? ''}
              onChange={(e) =>
                onChange({
                  audioTarget: e.target.value === '' ? null : (e.target.value as AudioTarget),
                })
              }
            >
              <option value="">{t('questionForm.audioTargetDefault')}</option>
              {AUDIO_TARGETS.map((target) => (
                <option key={target} value={target}>
                  {t(`settings.audioTarget.${target}`)}
                </option>
              ))}
            </Select>
          </Label>
        ) : null}
        {audioMediaId && !videoTakesSound ? (
          <div className="flex flex-col gap-1.5">
            <Label title={t('questionForm.waveformSizeHint')}>
              {t('questionForm.waveformSizeLabel')}
              <Select
                value={value.waveformSize}
                onChange={(e) => onChange({ waveformSize: e.target.value as WaveformSize })}
              >
                {WAVEFORM_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {t(`questionForm.waveformSize.${size}`)}
                  </option>
                ))}
              </Select>
            </Label>
            {value.waveformSize === 'hidden' ? (
              <p className="text-muted-foreground text-xs">
                {t('questionForm.waveformHiddenNote')}
              </p>
            ) : null}
            {peaks ? (
              <Waveform
                peaks={peaks}
                progress={0}
                size={value.waveformSize}
                className={cn('text-base', value.waveformSize === 'hidden' && 'opacity-40')}
                label={t('questionForm.waveformPreview')}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Disclosure>
  );
}

/** A group of the media section, drawn by a rule down its left side (as a question's). */
const GROUP = 'flex flex-col gap-1.5 border-l-2 pl-3';

function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start gap-2 text-sm', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        className="accent-primary mt-0.5"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground block">{hint}</span>
      </span>
    </label>
  );
}
