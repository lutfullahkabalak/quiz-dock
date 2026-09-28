import type { SlideBackground, SlideGradient, SlideTextTone } from '@quiz-dock/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** CSS for a generated gradient background. */
export function gradientCss(g: SlideGradient): string {
  return `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`;
}

/**
 * Full-cover background for a slide or a question: an uploaded image (darkened
 * or lightened to match the text tone) or a generated gradient, with the text
 * colour and an optional subtitle-like outline. Without a background the
 * surface is transparent and the text keeps the page colours.
 */
export function Surface({
  background,
  textTone,
  // The subtitle-like halo is the design default: only an explicit `false` removes it.
  textOutline = true,
  className,
  backdrop,
  children,
}: {
  background: SlideBackground | null | undefined;
  textTone?: SlideTextTone;
  textOutline?: boolean;
  className?: string;
  /** A layer drawn behind the content in place of an image — a slide's video (#125). */
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  const light = textTone !== 'dark';
  const has = Boolean(background) || Boolean(backdrop);
  return (
    <div
      className={cn(
        // `clip`, not `hidden`: no scroll container, so a sticky bar inside still sticks.
        'relative flex flex-col overflow-clip',
        has && (light ? 'text-white' : 'text-neutral-900'),
        has &&
          textOutline &&
          (light
            ? '[text-shadow:0_0_2px_rgba(0,0,0,.95),0_0_8px_rgba(0,0,0,.9),0_2px_2px_rgba(0,0,0,.9)]'
            : '[text-shadow:0_0_2px_rgba(255,255,255,.95),0_0_8px_rgba(255,255,255,.9),0_2px_2px_rgba(255,255,255,.9)]'),
        className,
      )}
      style={
        background && 'gradient' in background
          ? { backgroundImage: gradientCss(background.gradient) }
          : undefined
      }
    >
      {background && 'url' in background ? (
        <>
          <img
            src={background.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className={cn('absolute inset-0', light ? 'bg-black/40' : 'bg-white/55')} />
        </>
      ) : backdrop ? (
        <>
          {backdrop}
          <div className={cn('absolute inset-0', light ? 'bg-black/40' : 'bg-white/55')} />
        </>
      ) : null}
      <div className="relative z-10 flex w-full flex-1 flex-col">{children}</div>
    </div>
  );
}
