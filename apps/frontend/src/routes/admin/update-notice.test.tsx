import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi } from '../../test/harness';
import { UpdateNotice } from './update-notice';

const status = (over: Record<string, unknown> = {}) => ({
  kind: 'result',
  result: {
    outcome: 'done',
    notes: [],
    data: {
      current: '0.12.0',
      check: 'on',
      updateAvailable: true,
      checkedAt: '2026-10-03T08:00:00Z',
      output: [],
      latest: {
        version: '0.13.0',
        publishedAt: '2026-10-02T18:09:17Z',
        url: 'https://github.com/quizdock/quiz-dock/releases/tag/v0.13.0',
        changes: ['feat(store): add optional community catalogue'],
        upgrading: ['**Migrations**: two new tables.'],
      },
      ...over,
    },
  },
});

function show(body: unknown) {
  mockApi([{ method: 'POST', path: '/admin/operations/version.check', body }]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UpdateNotice />
      <p>page</p>
    </QueryClientProvider>,
  );
}

describe('UpdateNotice', () => {
  beforeEach(() => localStorage.clear());

  it('says which version is out, what to read first and the command that installs it', async () => {
    show(status());
    expect(await screen.findByText('QuizDock 0.13.0 est disponible.')).toBeInTheDocument();
    expect(screen.getByText('./quizdock upgrade 0.13.0')).toBeInTheDocument();
    expect(screen.getByText('Migrations')).toBeInTheDocument();
    expect(screen.getByText('feat(store): add optional community catalogue')).toBeInTheDocument();
  });

  it('hides a version until a newer one is out', async () => {
    show(status());
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Masquer jusqu’à la prochaine version',
      }),
    );
    expect(screen.queryByText('QuizDock 0.13.0 est disponible.')).not.toBeInTheDocument();
    expect(localStorage.getItem('qd-admin-update-hidden')).toBe('0.13.0');
  });

  it('says nothing when the instance is up to date', async () => {
    show(status({ updateAvailable: false, current: '0.13.0' }));
    await screen.findByText('page');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
