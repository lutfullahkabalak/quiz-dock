import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../i18n';
import { ListSkeleton, PageLoading, Spinner } from './loading';

describe('loading states', () => {
  it('says what it waits for, to screen readers at least', () => {
    render(<Spinner label="Envoi…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Envoi…');
  });

  it('a page shows the wheel and its word', () => {
    render(<PageLoading label="Connexion…" />);
    expect(screen.getByText('Connexion…')).toBeVisible();
  });

  it('a list keeps the shape of what comes, one placeholder per row', () => {
    const { container } = render(<ListSkeleton rows={3} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelectorAll('.rounded-lg.border')).toHaveLength(3);
  });
});
