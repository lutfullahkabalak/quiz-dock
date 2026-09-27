import type { RoomSoundsPayload, RoomSoundsSettings } from '@quiz-dock/contracts';
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useMediaControllerInstance, useMediaControllerList } from '../api/generated/media/media';
import { MediaUpload } from '../routes/media-upload';
import { SimpleDialog } from './media/sound-button';

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
  if (!sounds) return null;
  const summary = [
    sounds.tick ? t('control.sounds.tick') : null,
    sounds.ding ? t('control.sounds.ding') : null,
    sounds.countdown ? t('control.sounds.countdown') : null,
    sounds.gong ? t('control.sounds.gong') : null,
    sounds.musicUrl ? t('control.sounds.music') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Disclosure title={t('control.sounds.title')} value={summary || t('control.sounds.off')}>
      <div className="p-4 pt-2">
        <GameSoundsControls sounds={sounds} onChange={onChange} />
      </div>
    </Disclosure>
  );
}

/**
 * The room's mixer (#93): the same controls, from the console's control bar,
 * at any moment of a quiz — a level may need to move while players answer.
 */
export function RoomSoundsButton({
  sounds,
  onChange,
}: {
  sounds: RoomSoundsPayload | null;
  onChange: (patch: RoomSoundsSettings) => void;
}) {
  const { t } = useTranslation('live');
  const [open, setOpen] = useState(false);
  if (!sounds) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t('control.sounds.title')}
        title={t('control.sounds.title')}
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="size-4" />
        <span className="hidden sm:inline">{t('control.sounds.title')}</span>
      </Button>
      <SimpleDialog open={open} title={t('control.sounds.title')} onClose={() => setOpen(false)}>
        <GameSoundsControls sounds={sounds} onChange={onChange} />
      </SimpleDialog>
    </>
  );
}

/** The controls themselves: the effects, the track, the two levels. */
type SoundKey = 'tickId' | 'gongId' | 'musicId';

/**
 * One of the room's sounds: the built-in one (or none, for the track), or a
 * sound of the library — then the editor's own picker: upload one, take one of
 * *My sounds*, or of the instance's.
 */
function SoundSlot({
  label,
  none,
  mediaId,
  chosen,
  onChange,
}: {
  label: string;
  none: string;
  mediaId: string | null;
  chosen: boolean;
  onChange: (mediaId: string | null) => void;
}) {
  const { t } = useTranslation('live');
  const [fromLibrary, setFromLibrary] = useState(chosen);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">{label}</span>
        <Select
          className="h-8"
          aria-label={label}
          value={fromLibrary ? 'library' : ''}
          onChange={(e) => {
            const library = e.target.value === 'library';
            setFromLibrary(library);
            if (!library) onChange(null);
          }}
        >
          <option value="">{none}</option>
          <option value="library">{t('control.sounds.fromLibrary')}</option>
        </Select>
      </label>
      {fromLibrary ? (
        <MediaUpload
          kind="audio"
          value={mediaId}
          withDetails={false}
          label={t('control.sounds.addSound')}
          onChange={(id) => onChange(id)}
        />
      ) : null}
    </div>
  );
}

export function GameSoundsControls({
  sounds,
  onChange,
}: {
  sounds: RoomSoundsPayload;
  onChange: (patch: RoomSoundsSettings) => void;
}) {
  const { t } = useTranslation('live');
  const mine = useMediaControllerList({ kind: 'audio' }).data?.data ?? [];
  const instance = useMediaControllerInstance({ kind: 'audio' }).data?.data ?? [];
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
  const picker = (label: string, url: string | null, none: string, key: SoundKey) => (
    <SoundSlot
      key={key}
      label={label}
      none={none}
      mediaId={idOf(url) || null}
      chosen={url !== null}
      onChange={(id) => onChange({ [key]: id ?? '' })}
    />
  );
  const level = (
    label: string,
    value: number,
    key: 'musicLevel' | 'sfxLevel',
    muteKey: 'musicMuted' | 'sfxMuted',
  ) => (
    <label className="flex items-center gap-3">
      {/* The room's channel off (for every screen), its level kept for when it is back. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-pressed={sounds[muteKey]}
        aria-label={t(
          sounds[muteKey] ? 'control.sounds.unmuteChannel' : 'control.sounds.muteChannel',
          { bus: label },
        )}
        title={t(sounds[muteKey] ? 'control.sounds.unmuteChannel' : 'control.sounds.muteChannel', {
          bus: label,
        })}
        onClick={() => onChange({ [muteKey]: !sounds[muteKey] })}
      >
        {sounds[muteKey] ? (
          <VolumeX className="text-destructive size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </Button>
      <span
        className={
          sounds[muteKey]
            ? 'text-muted-foreground w-20 shrink-0 text-xs line-through'
            : 'text-muted-foreground w-20 shrink-0 text-xs'
        }
      >
        {label}
      </span>
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
    <div className="flex flex-col gap-4 text-sm">
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
      <label className="flex items-center gap-2">
        <Switch
          checked={sounds.ding}
          onCheckedChange={(ding) => onChange({ ding })}
          aria-label={t('control.sounds.dingLabel')}
        />
        {t('control.sounds.dingLabel')}
      </label>
      {/* The countdown is synthesised only: a clock keeps a steady click, not a sample's. */}
      <label className="flex items-center gap-2">
        <Switch
          checked={sounds.countdown}
          onCheckedChange={(countdown) => onChange({ countdown })}
          aria-label={t('control.sounds.countdownLabel')}
        />
        {t('control.sounds.countdownLabel')}
      </label>
      {picker(
        t('control.sounds.musicLabel'),
        sounds.musicUrl,
        t('control.sounds.noMusic'),
        'musicId',
      )}
      <div className="flex flex-col gap-2">
        {level(t('control.sounds.musicLevel'), sounds.musicLevel, 'musicLevel', 'musicMuted')}
        {level(t('control.sounds.sfxLevel'), sounds.sfxLevel, 'sfxLevel', 'sfxMuted')}
      </div>
    </div>
  );
}
