import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/harness';

describe('LoginPage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('connecte en mode local et redirige vers le tableau de bord', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u1', displayName: 'Marie', email: null, role: 'host' },
      },
      { method: 'GET', path: '/quizzes', body: [] },
    ]);
    renderApp('/login');

    const input = await screen.findByLabelText('Votre nom');
    fireEvent.change(input, { target: { value: 'Marie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prendre le siège d’animateur' }));

    // l'identité locale est mémorisée
    expect(localStorage.getItem('live.localUser')).toBe('Marie');
    // navigation effective vers le tableau de bord (rendu après login)
    expect(await screen.findByText('Mes quiz')).toBeInTheDocument();
  });

  it('seat held: offers to take part, and a name that is not the holder signs nobody in', async () => {
    mockApi([
      { method: 'GET', path: '/auth/host-seat', body: { holder: 'Alice' } },
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u2', displayName: 'Bob', email: null, role: 'player' },
      },
    ]);
    renderApp('/login');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tenu par Alice'));
    expect(screen.getByRole('link', { name: 'Rejoindre un salon en participant' })).toHaveAttribute(
      'href',
      '/',
    );
    fireEvent.change(await screen.findByLabelText('Votre nom'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revenir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ne tient pas le siège');
    expect(screen.queryByRole('heading', { name: 'Mes quiz' })).not.toBeInTheDocument();
    // Identité non conservée : pas de nav hôte, pas d'accès au tableau de bord.
    expect(localStorage.getItem('live.localUser')).toBeNull();
  });

  it('free seat: one step — name, how long, take it', async () => {
    const fetchMock = mockApi([
      { method: 'GET', path: '/auth/host-seat', body: { holder: null, expiresAt: null } },
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u1', displayName: 'Marie', email: null, role: 'player' },
      },
      { method: 'POST', path: '/auth/host-seat/claim', body: { holder: 'Marie', expiresAt: null } },
      { method: 'GET', path: '/quizzes', body: [] },
    ]);
    renderApp('/login');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Siège libre'));
    fireEvent.change(await screen.findByLabelText('Votre nom'), { target: { value: 'Marie' } });
    fireEvent.change(screen.getByLabelText('Garder le siège'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prendre le siège d’animateur' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(([u, o]) => String(u).includes('/claim') && o?.method === 'POST'),
      ).toBeDefined(),
    );
    const claim = fetchMock.mock.calls.find(([u]) => String(u).includes('/claim'))!;
    expect(JSON.parse(String(claim[1]?.body))).toEqual({ expiresInMinutes: null });
    expect(await screen.findByRole('heading', { name: 'Mes quiz' })).toBeInTheDocument();
  });

  it('shows who holds the seat and until when', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/auth/host-seat',
        body: { holder: 'Alice', expiresAt: '2026-09-18T18:30:00.000Z' },
      },
    ]);
    renderApp('/login');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Alice'));
    expect(screen.getByRole('status')).toHaveTextContent('jusqu’à');
  });

  it('says so when the seat cannot be taken for another reason than someone else (audit E3)', async () => {
    mockApi([
      { method: 'GET', path: '/auth/host-seat', body: { holder: null, expiresAt: null } },
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u1', displayName: 'Marie', email: null, role: 'player' },
      },
      { method: 'POST', path: '/auth/host-seat/claim', status: 500, body: {} },
    ]);
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('Votre nom'), { target: { value: 'Marie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prendre le siège d’animateur' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
