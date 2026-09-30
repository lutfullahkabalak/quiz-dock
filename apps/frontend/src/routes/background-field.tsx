import type { SlideGradient, SlideTextTone } from '@quiz-dock/contracts';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { gradientCss } from '../game/surface';
import { MediaUpload } from './media-upload';
import { Segmented } from '@/components/ui/segmented';

/** What a slide or a question stores about its background. */
export interface BackgroundValue {
  mediaId: string | null;
  gradient: SlideGradient | null;
  textTone: SlideTextTone;
  textOutline: boolean;
}

export const NO_BACKGROUND: BackgroundValue = {
  mediaId: null,
  gradient: null,
  textTone: 'light',
  textOutline: true,
};

const DEFAULT_GRADIENT: SlideGradient = { angle: 135, colors: ['#1e3a8a', '#7c3aed'] };

/**
 * Background settings, folded by default (white is the norm): none, an uploaded
 * image, or a gradient built from 2–4 colours and an angle; then the text
 * contrast (tone + outline) once a background exists.
 */
export function BackgroundField({
  value,
  onChange,
}: {
  value: BackgroundValue;
  onChange: (next: BackgroundValue) => void;
}) {
  const { t } = useTranslation('editor');
  // The kind follows the value (a discarded draft puts it back); only "image, the file
  // still to come" has no value of its own, so it is kept here until the upload lands.
  type Kind = 'none' | 'image' | 'gradient';
  const [imagePending, setImagePending] = useState(false);
  const kind: Kind = value.mediaId
    ? 'image'
    : value.gradient
      ? 'gradient'
      : imagePending
        ? 'image'
        : 'none';
  const setKind = (k: Kind) => {
    setImagePending(k === 'image');
    onChange({
      ...value,
      mediaId: k === 'image' ? value.mediaId : null,
      gradient: k === 'gradient' ? (value.gradient ?? DEFAULT_GRADIENT) : null,
    });
  };
  const g = value.gradient;
  const setGradient = (next: SlideGradient) => onChange({ ...value, gradient: next });

  return (
    <Disclosure
      title={t('background.legend')}
      value={
        <>
          {t(`background.kind.${kind}`)}
          {kind === 'gradient' && g ? (
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full border"
              style={{ backgroundImage: gradientCss(g) }}
            />
          ) : null}
        </>
      }
    >
      <Segmented
        className="w-fit"
        label={t('background.legend')}
        value={kind}
        onChange={setKind}
        options={(['none', 'image', 'gradient'] as const).map((k) => ({
          value: k,
          label: t(`background.kind.${k}`),
        }))}
      />

      {kind === 'image' ? (
        <MediaUpload
          value={value.mediaId}
          onChange={(id) => onChange({ ...value, mediaId: id, gradient: null })}
        />
      ) : null}

      {kind === 'gradient' && g ? (
        <div className="flex flex-col gap-3">
          <div
            className="h-12 w-full rounded-md border"
            style={{ backgroundImage: gradientCss(g) }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {g.colors.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <input
                  type="color"
                  aria-label={t('background.color', { index: i + 1 })}
                  className="size-9 cursor-pointer rounded-md border p-0.5"
                  value={c}
                  onChange={(e) =>
                    setGradient({
                      ...g,
                      colors: g.colors.map((x, idx) => (idx === i ? e.target.value : x)),
                    })
                  }
                />
                {g.colors.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t('background.removeColor', { index: i + 1 })}
                    onClick={() =>
                      setGradient({ ...g, colors: g.colors.filter((_, idx) => idx !== i) })
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </span>
            ))}
            {g.colors.length < 4 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setGradient({ ...g, colors: [...g.colors, g.colors[g.colors.length - 1]] })
                }
              >
                <Plus className="size-4" />
                {t('background.addColor')}
              </Button>
            ) : null}
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0">{t('background.angle')}</span>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              className="flex-1"
              value={g.angle}
              onChange={(e) => setGradient({ ...g, angle: Number(e.target.value) })}
            />
            <span className="w-12 text-right tabular-nums">{g.angle}°</span>
          </label>
        </div>
      ) : null}

      {kind !== 'none' ? (
        <div className="flex flex-wrap items-center gap-4 border-t pt-3">
          <label className="flex items-center gap-2 text-[1em]">
            <span className="font-medium">{t('slideForm.contrastLegend')}</span>
            <Select
              className="h-8 w-auto"
              value={value.textTone}
              onChange={(e) => onChange({ ...value, textTone: e.target.value as SlideTextTone })}
            >
              <option value="light">{t('slideForm.tone.light')}</option>
              <option value="dark">{t('slideForm.tone.dark')}</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={value.textOutline}
              onCheckedChange={(checked) => onChange({ ...value, textOutline: checked })}
              aria-label={t('slideForm.outline')}
            />
            {t('slideForm.outline')}
          </label>
        </div>
      ) : null}
    </Disclosure>
  );
}
