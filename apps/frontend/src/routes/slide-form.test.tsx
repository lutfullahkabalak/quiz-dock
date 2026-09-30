import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/harness';
import { SlideForm } from './slide-form';

function renderForm(quizStatus: 'draft' | 'ready' = 'draft', onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SlideForm quizId="q1" quizStatus={quizStatus} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

const posted = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .filter(([url, o]) => String(url).includes('/quizzes/q1/slides') && o?.method === 'POST')
    .map(([, o]) => JSON.parse(String((o as RequestInit).body)));

describe('SlideForm (UI system §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('flags an empty block, left out when saved', () => {
    mockApi([]);
    renderForm();
    expect(screen.getByText('Vide — ignoré à l’enregistrement.')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Titre…'), { target: { value: 'Bienvenue' } });
    expect(screen.queryByText('Vide — ignoré à l’enregistrement.')).toBeNull();
  });

  it('a removed block can be taken back', () => {
    mockApi([]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('Titre…'), { target: { value: 'Bienvenue' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer le bloc' })[0]);
    expect(screen.queryByDisplayValue('Bienvenue')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rétablir' }));
    expect(screen.getByDisplayValue('Bienvenue')).toBeInTheDocument();
  });

  it('a draft saves a slide that shows nothing yet', async () => {
    const fetchMock = mockApi([
      { method: 'POST', path: '/quizzes/q1/slides', status: 201, body: {} },
    ]);
    const onClose = renderForm();
    fireEvent.change(screen.getByPlaceholderText('Titre…'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('Titre…'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posted(fetchMock)[0].blocks).toEqual([]);
  });

  it('in a published quiz, an empty slide offers to go back to draft', async () => {
    const fetchMock = mockApi([]);
    renderForm('ready');
    fireEvent.change(screen.getByPlaceholderText('Titre…'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Enregistrer cette diapositive vide ?')).toBeInTheDocument();
    expect(posted(fetchMock)).toHaveLength(0);
  });
});
