import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/harness';
import { configureCommunityStore } from '../config';
const entry = {
  key: 'a'.repeat(64),
  id: 'forge.example/alice/ports',
  title: 'Ports',
  description: 'A network quiz',
  language: 'en',
  tags: ['network'],
  license: 'CC0-1.0',
  questionCount: 1,
  author: 'alice',
  registry: 'https://store.example/registry.json',
  source: 'https://author.example/index.json',
  homepage: null,
  reportUrl: 'https://author.example/issues/new',
  updatedAt: '2026-09-29T12:00:00Z',
  size: 100,
};
const host = {
  method: 'GET',
  path: '/me',
  body: { id: 'host', roles: ['host'], displayName: 'Marc' },
};
const question = {
  id: 'qq1',
  quizId: entry.key,
  orderIndex: 0,
  type: 'single_choice',
  prompt: 'Port?',
  media: { visual: null, audio: null },
  timeLimitS: 20,
  pointsMode: 'standard',
  numericValue: null,
  numericTolerance: null,
  options: [
    {
      id: 'o1',
      orderIndex: 0,
      text: 'A',
      mediaId: null,
      color: 'red',
      shape: 'triangle',
      isCorrect: true,
      correctOrderIndex: null,
    },
    {
      id: 'o2',
      orderIndex: 1,
      text: 'B',
      mediaId: null,
      color: 'blue',
      shape: 'circle',
      isCorrect: false,
      correctOrderIndex: null,
    },
  ],
  acceptedAnswers: [],
};
const preview = {
  ...entry,
  coverUrl: null,
  slideCount: 0,
  questions: [question],
  slides: [],
  media: {},
  invalid: null,
};
describe('community catalogue and common preview', () => {
  beforeEach(() => {
    localStorage.setItem('live.localUser', 'Marc');
    configureCommunityStore(true);
  });
  afterEach(() => {
    localStorage.clear();
    configureCommunityStore(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('shows licence/provenance, filters and opens the common quiz preview', async () => {
    mockApi([
      host,
      {
        method: 'GET',
        path: /\/community-store$/,
        body: { enabled: true, entries: [entry], unavailable: [] },
      },
      { method: 'GET', path: `/community-store/${entry.key}`, body: preview },
    ]);
    renderApp('/community');
    expect(await screen.findByText('Ports')).toBeInTheDocument();
    expect(screen.getByText(/Licence CC0-1.0/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un modèle' }), {
      target: { value: 'missing' },
    });
    expect(screen.queryByText('Ports')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un modèle' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('link', { name: /Ports/ }));
    expect((await screen.findAllByText('Port?')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute('href', entry.source);
    expect(screen.getByRole('link', { name: 'Signaler un problème' })).toHaveAttribute(
      'href',
      entry.reportUrl,
    );
    expect(screen.getByRole('button', { name: 'Projection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Téléphone/ })).toBeInTheDocument();
  });
  it('creates a draft and opens its editor', async () => {
    const fetch = mockApi([
      host,
      {
        method: 'GET',
        path: /\/community-store$/,
        body: { enabled: true, entries: [entry], unavailable: [] },
      },
      { method: 'POST', path: '/community-store/take', body: { id: 'copy' } },
    ]);
    const { router } = renderApp('/community');
    fireEvent.click(await screen.findByRole('button', { name: /Créer un quiz/ }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/quizzes/copy'));
    expect(
      fetch.mock.calls.some(
        ([, opts]) => opts?.method === 'POST' && String(opts.body).includes(entry.key),
      ),
    ).toBe(true);
  });
  it('does not request community content for a player', async () => {
    const fetch = mockApi([{ ...host, body: { id: 'player', roles: ['player'] } }]);
    renderApp('/community');
    expect(
      await screen.findByText('Créer un quiz à partir d’un modèle est une action d’animateur.'),
    ).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('community-store'))).toBe(false);
  });
  it('redirects to internal templates without a community request when disabled', async () => {
    configureCommunityStore(false);
    const fetch = mockApi([host, { method: 'GET', path: '/store', body: [] }]);
    renderApp('/community');
    expect(await screen.findByText('Aucun modèle pour l’instant')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('community-store'))).toBe(false);
  });
  it('loads preview media with host authentication and revokes its blob URLs', async () => {
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:preview-image',
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    let cleanup: (() => void) | undefined;
    try {
      const mediaPath = `/community-store/${entry.key}/media/image.png`;
      const fetch = mockApi([
        host,
        { method: 'GET', path: mediaPath, body: '' },
        {
          method: 'GET',
          path: `/community-store/${entry.key}`,
          body: {
            ...preview,
            media: { image: '/api/v1' + mediaPath },
            questions: [
              {
                ...question,
                media: {
                  visual: { kind: 'image', assetId: 'image' },
                  audio: null,
                },
              },
            ],
          },
        },
      ]);
      const { unmount } = renderApp(`/community/${entry.key}`);
      cleanup = unmount;
      await vi.waitFor(() =>
        expect(document.querySelector('img[src="blob:preview-image"]')).not.toBeNull(),
      );
      const call = fetch.mock.calls.find(([url]) => String(url).includes('/media/image.png'));
      expect(call?.[1]?.headers).toMatchObject({ 'X-Local-User': 'Marc' });
      unmount();
      expect(revoke).toHaveBeenCalledWith('blob:preview-image');
    } finally {
      cleanup?.();
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      else delete (URL as unknown as Record<string, unknown>).createObjectURL;
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
      else delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
    }
  });
});
