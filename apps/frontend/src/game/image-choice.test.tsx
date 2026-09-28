import { OptionColor, OptionShape, type PublicOption } from '@quiz-dock/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageChoiceGrid, optionLabel, screenFitWidth } from './image-choice';
import { Distribution } from './live-components';

const COLORS = [OptionColor.Red, OptionColor.Blue, OptionColor.Yellow, OptionColor.Green];
const SHAPES = [OptionShape.Triangle, OptionShape.Diamond, OptionShape.Circle, OptionShape.Square];
const pictures = (count: number): PublicOption[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `o${i}`,
    text: null,
    color: COLORS[i],
    shape: SHAPES[i],
    media: { url: `/api/v1/media/p${i}`, kind: 'image', alt: `Picture ${i}` },
  }));

describe('ImageChoiceGrid', () => {
  it('lays the pictures out in their order, two columns, each framed in its colour', () => {
    render(<ImageChoiceGrid options={pictures(4)} />);
    const images = screen.getAllByRole('img');
    expect(images.map((img) => img.getAttribute('alt'))).toEqual([
      'Picture 0',
      'Picture 1',
      'Picture 2',
      'Picture 3',
    ]);
    expect(images[0].closest('ul')).toHaveClass('grid-cols-2');
    // The frame carries the answer's colour, position by position (as the text answers).
    const frames = screen.getAllByRole('listitem').map((li) => li.firstElementChild);
    expect(frames.map((f) => [...f!.classList].find((c) => c.startsWith('bg-')))).toEqual([
      'bg-answer-red',
      'bg-answer-blue',
      'bg-answer-yellow',
      'bg-answer-green',
    ]);
  });

  it('fits the screen: sized on both sides of its container, one or two rows', () => {
    const { container } = render(<ImageChoiceGrid fit="screen" options={pictures(4)} />);
    expect((container.firstElementChild as HTMLElement).style.containerType).toBe('size');
    // One row of two 4:3 tiles: 8/3 as wide as it is high, plus the gap between them.
    expect(screenFitWidth(2)).toBe(`min(100cqw, calc((100cqh - 0em) * ${8 / 3} + 0.6em))`);
    // Two rows: 4/3 as wide as its height less the gap between the rows.
    expect(screenFitWidth(4)).toBe(`min(100cqw, calc((100cqh - 0.6em) * ${4 / 3} + 0.6em))`);
  });

  it('at the reveal: the wrong ones dimmed, the right one ticked, each with its count', () => {
    render(<ImageChoiceGrid options={pictures(4)} correctIds={['o1']} counts={{ o0: 3, o1: 5 }} />);
    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveTextContent('✓');
    expect(items[0]).not.toHaveTextContent('✓');
    expect(items[0].querySelector('.bg-black\\/65')).not.toBeNull();
    expect(items[1].querySelector('.bg-black\\/65')).toBeNull();
    expect(items.map((li) => li.textContent?.replace('✓', ''))).toEqual(['3', '5', '0', '0']);
  });

  it('picks by tile, named by the alt for whoever cannot see it', () => {
    const onPick = vi.fn();
    render(<ImageChoiceGrid options={pictures(2)} onPick={onPick} selectedIds={['o0']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Picture 1' }));
    expect(onPick).toHaveBeenCalledWith('o1');
    expect(screen.getByRole('button', { name: 'Picture 0' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('a picture answer elsewhere', () => {
  it('is named by its alt, never by its colour alone', () => {
    expect(optionLabel(pictures(1)[0])).toBe('Picture 0');
    expect(optionLabel({ text: null, color: OptionColor.Red, media: null })).toBe('red');
  });

  it('shows its picture and its alt in the distribution', () => {
    render(
      <Distribution
        options={pictures(2)}
        reveal={{ distribution: { o0: 1, o1: 2 }, correctOptionIds: ['o0'] } as never}
      />,
    );
    expect(screen.getByText('Picture 1')).toBeInTheDocument();
    expect(screen.getAllByRole('presentation').map((img) => img.getAttribute('src'))).toEqual([
      '/api/v1/media/p0',
      '/api/v1/media/p1',
    ]);
  });
});
