import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  tickUrl: null,
  gongUrl: null,
  musicUrl: null,
  musicLevel: 0.5,
  sfxLevel: 0.8,
};

describe('GameSoundsPanel (#93)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers the host’s sounds and the instance’s, and sends what changes', async () => {
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
    expect(screen.getByText('Tic · Gong')).toBeInTheDocument();
    const track = screen.getByRole('combobox', { name: 'Musique de fond pendant les réponses' });
    await waitFor(() =>
      expect(screen.getAllByRole('option', { name: 'My jingle' }).length).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByRole('option', { name: 'Gong of the house (instance)' }).length,
    ).toBeGreaterThan(0);
    fireEvent.change(track, { target: { value: 'm1' } });
    expect(onChange).toHaveBeenCalledWith({ musicId: 'm1' });
    fireEvent.click(screen.getByRole('switch', { name: 'Un tic à chaque réponse' }));
    expect(onChange).toHaveBeenCalledWith({ tick: false });
    fireEvent.change(screen.getByRole('slider', { name: 'Effets' }), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith({ sfxLevel: 0.3 });
  });
});
