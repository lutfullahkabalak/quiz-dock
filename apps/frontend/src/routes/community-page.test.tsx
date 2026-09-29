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
describe('CommunityPage', () => {
  beforeEach(() => {
    localStorage.setItem('live.localUser', 'Marc');
    configureCommunityStore(true);
  });
  afterEach(() => {
    localStorage.clear();
    configureCommunityStore(false);
    vi.unstubAllGlobals();
  });
  it('shows source and licence, filters, and opens a text preview', async () => {
    mockApi([
      {
        method: 'GET',
        path: /\/community-store$/,
        body: { enabled: true, entries: [entry], unavailable: [] },
      },
      {
        method: 'GET',
        path: `/community-store/${entry.key}`,
        body: { title: 'Ports', items: [{ kind: 'question', text: 'Port?', options: ['A', 'B'] }] },
      },
    ]);
    renderApp('/community');
    expect(await screen.findByText('Ports')).toBeInTheDocument();
    expect(screen.getByText('Licence CC0-1.0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute('href', entry.source);
    expect(screen.getByRole('link', { name: 'Signaler un problème' })).toHaveAttribute(
      'href',
      entry.reportUrl,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('Port?')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un modèle' }), {
      target: { value: 'missing' },
    });
    expect(
      screen.queryByRole('button', { name: 'Créer à partir de ceci' }),
    ).not.toBeInTheDocument();
  });
  it('redirects to internal templates without a community request when disabled', async () => {
    configureCommunityStore(false);
    const fetch = mockApi([{ method: 'GET', path: '/store', body: [] }]);
    renderApp('/community');
    expect(await screen.findByText('Aucun modèle pour l’instant')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('community-store'))).toBe(false);
  });
});
