import { GameState } from '@quiz-dock/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSocket } from '../game-client';
import type { GameView } from '../use-game-session';

vi.mock('./media-pool', () => ({
  preloadMedia: vi.fn(async () => true),
  waitedFor: vi.fn(() => true),
}));
vi.mock('./game-sounds', () => ({ useGameSounds: vi.fn() }));
vi.mock('./media-position', () => ({ clearRoomPositions: vi.fn() }));

import { useGameSounds } from './game-sounds';
import { clearRoomPositions } from './media-position';
import { preloadMedia } from './media-pool';
import { hasGameSounds, useRoomMedia } from './use-room-media';

const next = { questionIndex: 2, media: { visual: null, audio: null }, images: [], videos: [] };
const view = (over: Partial<GameView> = {}) =>
  ({ state: 'LEADERBOARD', questionIndex: 1, preload: next, sounds: null, ...over }) as GameView;

describe('useRoomMedia: what a device of the room does with the game’s media (audit F10)', () => {
  afterEach(() => vi.clearAllMocks());

  const run = (preload: 'off' | 'fetch' | 'ready', v = view()) => {
    const socket = { emit: vi.fn() };
    renderHook(() =>
      useRoomMedia(v, '482913', socket as unknown as GameSocket, { sounds: true, preload }),
    );
    return socket;
  };

  it('the projection and a phone fetch what comes next, and say when they can play it', async () => {
    const socket = run('ready');
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('media:ready', { pin: '482913', questionIndex: 2 }),
    );
  });

  it('a copy fetches ahead but is never waited for; the console’s preview fetches nothing', async () => {
    const copy = run('fetch');
    await waitFor(() => expect(preloadMedia).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(copy.emit).not.toHaveBeenCalled();
    vi.clearAllMocks();
    run('off');
    expect(preloadMedia).not.toHaveBeenCalled();
  });

  it('forgets the last game’s positions in a new lobby, and plays the game’s sounds as told', () => {
    run('ready', view({ state: GameState.Lobby, preload: null }));
    expect(clearRoomPositions).toHaveBeenCalledWith('482913');
    expect(vi.mocked(useGameSounds).mock.calls[0][2]).toBe(true);
  });

  it('knows a room with no game sound', () => {
    expect(hasGameSounds(null)).toBe(false);
    expect(hasGameSounds({ tick: false, gong: false, musicUrl: null } as never)).toBe(false);
    expect(hasGameSounds({ tick: false, gong: true, musicUrl: null } as never)).toBe(true);
  });
});
