import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundField, type BackgroundValue } from './background-field';

const none: BackgroundValue = {
  mediaId: null,
  gradient: null,
  textTone: 'light',
  textOutline: true,
};
const gradient: BackgroundValue = { ...none, gradient: { angle: 90, colors: ['#000', '#fff'] } };

const ui = (value: BackgroundValue) => (
  <QueryClientProvider client={new QueryClient()}>
    <BackgroundField value={value} onChange={vi.fn()} />
  </QueryClientProvider>
);

describe('BackgroundField', () => {
  it('follows its value when the form puts it back, a draft discarded (audit E6)', () => {
    const { rerender } = render(ui(gradient));
    expect(screen.getByRole('button', { name: 'Dégradé', pressed: true })).toBeInTheDocument();
    rerender(ui(none)); // the draft with a gradient is discarded: back to white
    expect(screen.getByRole('button', { name: 'Blanc', pressed: true })).toBeInTheDocument();
  });
});
