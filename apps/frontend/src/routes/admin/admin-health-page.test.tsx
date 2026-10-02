import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/harness';
import { HealthPage, groupChecks } from './admin-health-page';

const result = (data: unknown) => ({
  kind: 'result',
  result: { outcome: 'done', notes: [], data },
});

const output = [
  { level: 'line', text: 'Database' },
  { level: 'ok', text: 'PostgreSQL reachable' },
  { level: 'line', text: 'Redis' },
  { level: 'fail', text: 'Redis unreachable' },
  { level: 'line', text: '1 problem.' },
];

describe('groupChecks', () => {
  it('a line opens a group; a closing line without checks is left out', () => {
    expect(groupChecks(output as never)).toEqual([
      { title: 'Database', checks: [{ level: 'ok', text: 'PostgreSQL reachable' }] },
      { title: 'Redis', checks: [{ level: 'fail', text: 'Redis unreachable' }] },
    ]);
  });
});

describe('HealthPage', () => {
  it('says first what is wrong, then each part checked and the migrations', async () => {
    mockApi([
      { method: 'POST', path: '/admin/operations/health.doctor', body: result({ output }) },
      {
        method: 'POST',
        path: '/admin/operations/migrations.status',
        body: result({ applied: ['0001_init', '0002_more'], pending: ['0003_next'], failed: [] }),
      },
      { method: 'POST', path: '/admin/operations/settings.list', status: 500, body: {} },
      {
        method: 'POST',
        path: '/admin/operations/version.check',
        body: result({
          current: '0.12.0',
          check: 'on',
          updateAvailable: true,
          checkedAt: '2026-10-03T08:00:00Z',
          output: [],
          latest: {
            version: '0.13.0',
            publishedAt: '2026-10-02T18:09:17Z',
            url: '',
            changes: [],
            upgrading: [],
          },
        }),
      },
    ]);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <HealthPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('2 problèmes à regarder')).toBeInTheDocument();
    expect(screen.getByText('Redis unreachable')).toBeInTheDocument();
    expect(await screen.findByText('2 appliquées · 1 en attente')).toBeInTheDocument();
    expect(screen.getByText('0003_next')).toBeInTheDocument();
    // A newer release is news, not a problem: the verdict does not count it.
    expect(await screen.findByText('Cette instance : 0.12.0')).toBeInTheDocument();
    expect(screen.getByText('0.13.0 disponible depuis le 2 octobre 2026')).toBeInTheDocument();
    // The notice's content, one click away.
    fireEvent.click(screen.getByRole('button', { name: 'Voir la mise à jour' }));
    expect(screen.getByText('./quizdock upgrade 0.13.0')).toBeInTheDocument();
  });
});
