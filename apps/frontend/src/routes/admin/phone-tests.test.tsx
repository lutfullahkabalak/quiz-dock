import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SettingsList } from '@quiz-dock/contracts';
import { describe, expect, it } from 'vitest';
import { PhoneTests } from './phone-tests';

const data = (scope: 'read' | 'write'): SettingsList =>
  ({
    rows: [
      { key: 'APP_PUBLIC_URL', value: 'https://quiz.example.org', locked: false },
      { key: 'HOST_LAN_IPS', value: [], locked: false },
    ],
    rules: [],
    access: {
      scope,
      locks: [],
      authMode: 'oidc',
      tokenRequired: false,
      tokenSet: false,
      safeMode: false,
    },
  }) as unknown as SettingsList;

const show = (scope: 'read' | 'write') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PhoneTests data={data(scope)} adopt />
    </QueryClientProvider>,
  );

describe('PhoneTests, from the administration', () => {
  it("names the instance's invitation address, and says a reached one can replace it", () => {
    show('write');
    expect(screen.getByText('L’adresse pour rejoindre de l’instance')).toBeInTheDocument();
    expect(
      screen.getByText(/faites-en l’adresse pour rejoindre de l’instance/),
    ).toBeInTheDocument();
  });

  it('says so when the administration cannot change the address', () => {
    show('read');
    expect(
      screen.getByText(/L’administration ne peut pas modifier les réglages ici/),
    ).toBeInTheDocument();
  });

  it('tests an address typed by hand', () => {
    show('write');
    fireEvent.change(screen.getByLabelText('Autre adresse'), {
      target: { value: 'http://192.168.1.20:18080/join' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByText('http://192.168.1.20:18080')).toBeInTheDocument();
  });
});
