import type { RoomSoundsPayload, RoomSoundsSettings } from '@quiz-dock/contracts';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui/disclosure';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useMediaControllerInstance, useMediaControllerList } from '../api/generated/media/media';

/**
 * The room's game sounds (#93), in the console's lobby: the tick and the gong
 * (synthesised, or a sound of the library), a background track, and the MUSIC
 * and SFX levels. The console does not play them: the projection and remote
 * participants do (SPECIFICATIONS-MEDIA §9).
 */
export function GameSoundsPanel({
  sounds,
  onChange,
}: {
  sounds: RoomSoundsPayload | null;
  onChange: (patch: RoomSoundsSettings) => void;
}) {
  const { t } = useTranslation('live');
  const mine = useMediaControllerList({ kind: 'audio' }).data?.data ?? [];
  const instance = useMediaControllerInstance({ kind: 'audio' }).data?.data ?? [];
  if (!sounds) return null;
  const options = [
    ...mine.map((m) => ({ id: m.id, url: m.url, label: m.name || m.id })),
    ...instance.map((m) => ({
      id: m.id,
      url: m.url,
      label: t('control.sounds.instanceMedia', { name: m.name || m.id }),
    })),
  ];
  // The choice is kept as a URL on the screens' side: find its media back by it.
  const idOf = (url: string | null) => options.find((o) => o.url === url)?.id ?? '';
  const summary = [
    sounds.tick ? t('control.sounds.tick') : null,
    sounds.gong ? t('control.sounds.gong') : null,
    sounds.musicUrl ? t('control.sounds.music') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const picker = (
    label: string,
    url: string | null,
    none: string,
    key: keyof RoomSoundsSettings,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Select
        className="h-8"
        aria-label={label}
        value={idOf(url)}
        onChange={(e) => onChange({ [key]: e.target.value })}
      >
        <option value="">{none}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
  const level = (label: string, value: number, key: 'musicLevel' | 'sfxLevel') => (
    <label className="flex items-center gap-3">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={label}
        value={Math.round(value * 100)}
        onChange={(e) => onChange({ [key]: Number(e.target.value) / 100 })}
        className="accent-primary flex-1"
      />
      <span className="w-10 text-right text-xs tabular-nums">{Math.round(value * 100)} %</span>
    </label>
  );

  return (
    <Disclosure title={t('control.sounds.title')} value={summary || t('control.sounds.off')}>
      <div className="flex flex-col gap-4 p-4 pt-2 text-sm">
        <p className="text-muted-foreground text-xs">{t('control.sounds.hint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <Switch
                checked={sounds.tick}
                onCheckedChange={(tick) => onChange({ tick })}
                aria-label={t('control.sounds.tickLabel')}
              />
              {t('control.sounds.tickLabel')}
            </label>
            {sounds.tick
              ? picker(
                  t('control.sounds.sample'),
                  sounds.tickUrl,
                  t('control.sounds.synth'),
                  'tickId',
                )
              : null}
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <Switch
                checked={sounds.gong}
                onCheckedChange={(gong) => onChange({ gong })}
                aria-label={t('control.sounds.gongLabel')}
              />
              {t('control.sounds.gongLabel')}
            </label>
            {sounds.gong
              ? picker(
                  t('control.sounds.sample'),
                  sounds.gongUrl,
                  t('control.sounds.synth'),
                  'gongId',
                )
              : null}
          </div>
        </div>
        {picker(
          t('control.sounds.musicLabel'),
          sounds.musicUrl,
          t('control.sounds.noMusic'),
          'musicId',
        )}
        <div className="flex flex-col gap-2">
          {level(t('control.sounds.musicLevel'), sounds.musicLevel, 'musicLevel')}
          {level(t('control.sounds.sfxLevel'), sounds.sfxLevel, 'sfxLevel')}
        </div>
      </div>
    </Disclosure>
  );
}
