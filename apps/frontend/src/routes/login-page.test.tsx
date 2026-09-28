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
    fireEvent.click(screen.getByText('Continuer'));

    // l'identité locale est mémorisée
    expect(localStorage.getItem('live.localUser')).toBe('Marie');
    // navigation effective vers le tableau de bord (rendu après login)
    expect(await screen.findByText('Mes quiz')).toBeInTheDocument();
  });

  it('shows the seat holder and refuses a second host (player role) without navigating', async () => {
    mockApi([
      { method: 'GET', path: '/auth/host-seat', body: { holder: 'Alice' } },
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u2', displayName: 'Bob', email: null, role: 'player' },
      },
    ]);
    renderApp('/login');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Alice'));
    fireEvent.change(await screen.findByLabelText('Votre nom'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByText('Continuer'));

    expect(await screen.findByRole('alert')).toHaveTextContent('déjà pris');
    expect(screen.queryByRole('heading', { name: 'Mes quiz' })).not.toBeInTheDocument();
    // Identité non conservée : pas de nav hôte, pas d'accès au tableau de bord.
    expect(localStorage.getItem('live.localUser')).toBeNull();
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
  });

  it('free seat: explains the lock, asks for confirmation with an expiry, then claims', async () => {
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

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('un seul siège'));
    fireEvent.change(await screen.findByLabelText('Votre nom'), { target: { value: 'Marie' } });
    fireEvent.click(screen.getByText('Continuer'));

    // Dialogue d'explication + expiration, rien n'est pris avant confirmation.
    expect(await screen.findByText('Prendre le siège d’animateur ?')).toBeInTheDocument();
    expect(screen.getByText(/un seul animateur à la fois/)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([u, o]) => String(u).includes('/claim') && o?.method === 'POST'),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText('Expiration automatique'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Prendre le siège'));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(([u, o]) => String(u).includes('/claim') && o?.method === 'POST'),
      ).toBeDefined(),
    );
    const claim = fetchMock.mock.calls.find(([u]) => String(u).includes('/claim'))!;
    expect(JSON.parse(String(claim[1]?.body))).toEqual({ expiresInMinutes: null });
    expect(await screen.findByRole('heading', { name: 'Mes quiz' })).toBeInTheDocument();
  });

  it('free seat: cancelling the dialog drops the identity', async () => {
    mockApi([
      { method: 'GET', path: '/auth/host-seat', body: { holder: null, expiresAt: null } },
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u1', displayName: 'Marie', email: null, role: 'player' },
      },
    ]);
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('Votre nom'), { target: { value: 'Marie' } });
    fireEvent.click(screen.getByText('Continuer'));
    await screen.findByText('Prendre le siège d’animateur ?');
    fireEvent.click(screen.getByText('Annuler'));
    expect(localStorage.getItem('live.localUser')).toBeNull();
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
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
    expect(screen.getByRole('status')).toHaveTextContent('jusqu’au');
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
    fireEvent.click(screen.getByText('Continuer'));
    fireEvent.click(await screen.findByText('Prendre le siège'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
