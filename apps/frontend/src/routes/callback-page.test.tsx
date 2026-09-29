import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/harness';

describe('CallbackPage', () => {
  it('a sign-in that did not go through offers to try again, or to go home', async () => {
    mockApi([]);
    // No code in the address: the exchange fails at once.
    renderApp('/auth/callback', 'oidc');
    expect(await screen.findByText('La connexion n’a pas abouti')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/');
  });
});
