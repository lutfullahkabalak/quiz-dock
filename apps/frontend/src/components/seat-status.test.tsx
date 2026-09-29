import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/harness';

describe('SeatStatus (topbar, local mode)', () => {
  beforeEach(() => localStorage.setItem('live.localUser', 'Marc'));
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('counts down the holder’s seat and extends it for a chosen duration', async () => {
    const claimedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 90 * 60_000).toISOString(); // chosen: 2 h
    const fetchMock = mockApi([
      {
        method: 'POST',
        path: '/auth/host-seat/claim',
        body: { holder: 'Marc', expiresAt, claimedAt },
      },
      { method: 'GET', path: '/auth/host-seat', body: { holder: 'Marc', expiresAt, claimedAt } },
      { method: 'GET', path: '/quizzes', body: [] },
    ]);
    renderApp('/quizzes');
    // The countdown is in the topbar; renewal sits in the user menu.
    expect(await screen.findByText(/1 h 30 min restantes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Marc/ }));

    fireEvent.change(screen.getByLabelText('Prolonger le siège pour'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /^Prolonger$/ }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, opts]) => String(url).includes('/auth/host-seat/claim') && opts?.method === 'POST',
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ expiresInMinutes: 60 });
    });
  });

  it('shows no expiry for a seat without one, still lets the holder extend or release it', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/auth/host-seat',
        body: { holder: 'Marc', expiresAt: null, claimedAt: null },
      },
      { method: 'GET', path: '/quizzes', body: [] },
    ]);
    renderApp('/quizzes');
    fireEvent.click(await screen.findByRole('button', { name: /Marc/ }));
    expect(await screen.findByText(/Sans expiration/)).toBeInTheDocument();
    // Still extendable (to set an expiry) and releasable.
    expect(screen.getByRole('button', { name: /^Prolonger$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Libérer le siège/ })).toBeInTheDocument();
  });

  it('releasing the seat can be taken back for a few seconds (UI system §1.1)', async () => {
    const fetchMock = mockApi([
      {
        method: 'GET',
        path: '/auth/host-seat',
        body: { holder: 'Marc', expiresAt: null, claimedAt: null },
      },
      { method: 'GET', path: '/quizzes', body: [] },
    ]);
    renderApp('/quizzes');
    fireEvent.click(await screen.findByRole('button', { name: /Marc/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Libérer le siège/ }));
    // Said where it stays in view (the top bar), and in the menu.
    expect((await screen.findAllByText('Siège libéré.')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Rétablir' })[0]);
    expect(screen.queryByText('Siège libéré.')).toBeNull();
    // Nothing was sent: the seat stays.
    expect(
      fetchMock.mock.calls.some(
        ([url, opts]) => String(url).includes('/auth/host-seat/release') && opts?.method === 'POST',
      ),
    ).toBe(false);
  });
});
