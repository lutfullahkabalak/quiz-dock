import { KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ImageChoiceOptions, type ImageOptionValue } from './image-choice-options';

// Each answer's description comes back when the test says so, in any order.
const pending = new Map<string, (alt: string | null) => void>();
vi.mock('../api/generated/media/media', () => ({
  mediaControllerDescribe: (id: string) =>
    new Promise((resolve) => pending.set(id, (alt) => resolve({ data: { id, alt } }))),
}));
// The picker: a button that hands back a picture, as the library does after its round trip.
vi.mock('./media-upload', () => ({
  MediaUpload: ({ onChange, value }: { onChange: (id: string) => void; value: string | null }) => (
    <button type="button" data-value={value ?? ''} onClick={() => onChange(`pic-${Math.random()}`)}>
      pick
    </button>
  ),
}));

const option = (i: number): ImageOptionValue => ({
  key: `k${i}`,
  color: ['red', 'blue', 'yellow', 'green'][i],
  shape: ['triangle', 'diamond', 'circle', 'square'][i],
  mediaId: null,
  alt: '',
  isCorrect: i === 0,
});

let latest: ImageOptionValue[] = [];
function Harness() {
  const [options, setOptions] = useState([option(0), option(1)]);
  const ref = useRef(options);
  ref.current = options;
  latest = options;
  const sensors = useSensors(useSensor(KeyboardSensor));
  return (
    <ImageChoiceOptions
      options={options}
      currentOptions={() => ref.current}
      multiSelect={false}
      showErrors={false}
      sensors={sensors}
      setOptions={(next) => {
        ref.current = next;
        setOptions(next);
      }}
      newOption={option}
      onCorrect={() => {}}
      onMultiSelect={() => {}}
    />
  );
}

describe('ImageChoiceOptions', () => {
  it('two pictures picked in a row keep each other, their descriptions coming back late', async () => {
    render(<Harness />);
    const [first, second] = screen.getAllByRole('button', { name: 'pick' });
    fireEvent.click(first);
    fireEvent.click(second);
    const [a, b] = latest.map((o) => o.mediaId);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // The author writes the second text meanwhile; then the descriptions arrive, the first last.
    fireEvent.change(screen.getByLabelText('Texte alternatif de l’image 2'), {
      target: { value: 'Mine' },
    });
    await act(async () => pending.get(b!)!('From the library B'));
    await act(async () => pending.get(a!)!('From the library A'));
    expect(latest.map((o) => [o.mediaId, o.alt])).toEqual([
      [a, 'From the library A'],
      [b, 'Mine'],
    ]);
  });

  it('a description that comes back after its picture was replaced is dropped', async () => {
    render(<Harness />);
    const [first] = screen.getAllByRole('button', { name: 'pick' });
    fireEvent.click(first);
    const old = latest[0].mediaId!;
    fireEvent.click(first);
    const now = latest[0].mediaId!;
    await act(async () => pending.get(old)!('The old picture'));
    expect(latest[0]).toMatchObject({ mediaId: now, alt: '' });
  });
});
