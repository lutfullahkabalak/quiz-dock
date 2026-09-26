import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './combobox';

const OPTIONS = [
  { value: 'a', label: 'Évaluation sécurité', hint: '12 questions' },
  { value: 'b', label: 'Capitals', hint: '3 questions' },
  { value: 'c', label: 'Rivers', hint: '5 questions' },
];

function Harness({ onChange = vi.fn() }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Combobox
      aria-label="Quiz"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      emptyText="Nothing"
    />
  );
}

describe('Combobox', () => {
  it('filters as one types, accents and case aside, and picks with a click', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Quiz' });
    fireEvent.change(input, { target: { value: 'EVAL' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Évaluation sécurité12 questions',
    ]);
    fireEvent.click(screen.getByRole('option'));
    expect(input).toHaveValue('Évaluation sécurité');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves with the arrows and picks with Enter', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Quiz' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('says when nothing matches', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Quiz' }), { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });

  it('Escape closes the list only: a dialog around it does not hear it', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Harness />
      </div>,
    );
    const input = screen.getByRole('combobox', { name: 'Quiz' });
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });

  it('inline: the list stays shown, searches the keywords, and Escape clears the search only', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Combobox
          inline
          aria-label="Quiz"
          value=""
          onChange={vi.fn()}
          emptyText="Nothing"
          options={[
            { value: 'a', label: 'Capitals', keywords: 'geography europe' },
            { value: 'b', label: 'Rivers', keywords: 'water' },
          ]}
          renderOption={(o) => <b>{o.label}!</b>}
        />
      </div>,
    );
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('Capitals!')).toBeInTheDocument();
    const input = screen.getByRole('combobox', { name: 'Quiz' });
    fireEvent.change(input, { target: { value: 'europe' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Capitals!']);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(2); // still shown
    // With nothing typed, Escape is the dialog's again.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
