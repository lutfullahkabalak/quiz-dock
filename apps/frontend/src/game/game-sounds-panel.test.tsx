import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { mockApi } from '../test/harness';
import { GameSoundsPanel } from './game-sounds-panel';

const item = (id: string, name: string) => ({
  id,
  url: `/api/v1/media/${id}`,
  kind: 'audio',
  name,
  alt: null,
  credit: null,
  durationMs: 30000,
  peaks: [],
  width: null,
  height: null,
  sizeBytes: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  usedIn: 1,
  inHistory: false,
});

const SOUNDS = {
  tick: true,
  gong: true,
  countdown: true,
  ding: true,
  tickUrl: null,
  gongUrl: null,
  dingUrl: null,
  countdownUrl: null,
  musicUrl: null,
  musicLevel: 0.5,
  sfxLevel: 0.8,
  musicMuted: false,
  sfxMuted: false,
};

describe('GameSoundsPanel (#93)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers the built-in sound or one of the library, with the editor’s picker', async () => {
    mockApi([
      { method: 'GET', path: /\/media\/instance/, body: [item('i1', 'Gong of the house')] },
      { method: 'GET', path: /\/media\?/, body: [item('m1', 'My jingle')] },
    ]);
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GameSoundsPanel sounds={SOUNDS} onChange={onChange} />
      </QueryClientProvider>,
    );
    // Folded, the line says what is on.
    expect(
      screen.getByText('Réponse reçue · Début de question · Compte à rebours · Fin du temps'),
    ).toBeInTheDocument();
    const track = screen.getByRole('combobox', { name: 'Musique de fond pendant les réponses' });
    // Only the built-in choice and the way to the library: no list of every file.
    expect(screen.queryByRole('option', { name: 'My jingle' })).toBeNull();
    fireEvent.change(track, { target: { value: 'library' } });
    // The editor's picker: upload a sound, or take one of *My sounds* (and the instance's).
    expect(await screen.findByText('Ajouter un son')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mes sons/ })).toBeInTheDocument();
    fireEvent.change(track, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ musicId: '' });

    fireEvent.click(screen.getByRole('switch', { name: 'Un son à chaque réponse' }));
    expect(onChange).toHaveBeenCalledWith({ tick: false });
    fireEvent.change(screen.getByRole('slider', { name: 'Effets' }), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith({ sfxLevel: 0.3 });
    // Every effect can be heard here first, the room does not hear it.
    for (const name of ['Début de question', 'Réponse reçue', 'Compte à rebours', 'Fin du temps']) {
      expect(
        screen.getByRole('button', { name: `Écouter « ${name} » (ici seulement)` }),
      ).toBeInTheDocument();
    }
    // Each channel of the room has its own mute.
    fireEvent.click(screen.getByRole('button', { name: 'Couper Musique pour le salon' }));
    expect(onChange).toHaveBeenCalledWith({ musicMuted: true });
  });

  it('a sound of the library already chosen shows as such, ready to change or remove', async () => {
    mockApi([
      { method: 'GET', path: /\/media\/instance/, body: [] },
      { method: 'GET', path: /\/media\?/, body: [item('m1', 'My jingle')] },
    ]);
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GameSoundsPanel sounds={{ ...SOUNDS, musicUrl: '/api/v1/media/m1' }} onChange={onChange} />
      </QueryClientProvider>,
    );
    const track = screen.getByRole('combobox', { name: 'Musique de fond pendant les réponses' });
    expect(track).toHaveValue('library');
    fireEvent.click(await screen.findByRole('button', { name: /Retirer/ }));
    expect(onChange).toHaveBeenCalledWith({ musicId: '' });
  });
});
