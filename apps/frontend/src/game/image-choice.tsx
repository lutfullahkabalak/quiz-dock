import { TILE_RATIO } from '@quiz-dock/contracts';
import type { ReactNode } from 'react';
import { ShapeIcon } from '@/components/shape-icon';
import { COLOR_BG, OPTION_BG_FALLBACK } from '@/lib/option-style';
import { cn } from '@/lib/utils';

/**
 * An answer's colour and shape over a picture: a white shape in a square of the
 * answer's colour, both haloed so they read over any image. Sized by the text
 * around it (em), like every live element.
 */
export function ShapeBadge({
  color,
  shape,
  className,
}: {
  color: string;
  shape: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-[1.8em] shrink-0 items-center justify-center rounded-[0.3em] text-white',
        'shadow-[0_0_0_0.12em_rgb(255_255_255/0.9),0_0.1em_0.5em_rgb(0_0_0/0.55)]',
        COLOR_BG[color] ?? OPTION_BG_FALLBACK,
        className,
      )}
    >
      <ShapeIcon shape={shape} className="size-[1.1em] drop-shadow-[0_0_0.08em_rgb(0_0_0/0.7)]" />
    </span>
  );
}

/** How a tile shows at the reveal: as it was, dimmed (a wrong one) or put forward (a right one). */
export type TileState = 'idle' | 'dim' | 'correct';

/**
 * One answer of an image choice: the picture cropped to the tile's fixed ratio
 * (`object-fit: cover`, what the room sees), framed in the answer's colour, its
 * shape badge in the corner. The same tile on the projection, the phones and the
 * editor's preview, so an answer never looks different from one to the other.
 */
export function ImageTile({
  src,
  alt,
  color,
  shape,
  state = 'idle',
  className,
  children,
}: {
  /** The picture's URL; none yet (editor) leaves the tile empty, framed and badged. */
  src: string | null;
  alt: string;
  color: string;
  shape: string;
  state?: TileState;
  className?: string;
  /** Laid over the picture, bottom right: a count, a tick. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[0.5em] p-[0.2em] transition-[opacity,box-shadow]',
        COLOR_BG[color] ?? OPTION_BG_FALLBACK,
        state === 'correct' && 'shadow-[0_0_0_0.2em_white,0_0_1.2em_0.2em_rgb(255_255_255/0.6)]',
        className,
      )}
      style={{ aspectRatio: TILE_RATIO }}
    >
      <div className="bg-muted relative size-full overflow-hidden rounded-[0.35em]">
        {src ? (
          <img src={src} alt={alt} className="size-full object-cover" draggable={false} />
        ) : null}
        {state === 'dim' ? <div aria-hidden className="absolute inset-0 bg-black/65" /> : null}
      </div>
      <ShapeBadge color={color} shape={shape} className="absolute top-[0.5em] left-[0.5em]" />
      {children ? (
        <div className="absolute right-[0.5em] bottom-[0.5em] flex items-center gap-[0.3em]">
          {children}
        </div>
      ) : null}
    </div>
  );
}
