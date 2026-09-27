import { type MediaStepRef, sameMediaStep } from '@quiz-dock/contracts';
import type { GameView } from '../use-game-session';
import type { FollowedPosition } from './question-media-stage';

/**
 * The projection's last position in the sound of a step — a question, or a slide
 * (#125) — or null when none yet.
 */
export function followed(view: GameView, step: MediaStepRef): FollowedPosition | null {
  const position = view.mediaPosition;
  return sameMediaStep(position, step) ? position : null;
}

/** The host's last command on a step's media, or null when it spoke of another. */
export function anchorOf(view: GameView, step: MediaStepRef): GameView['mediaControl'] {
  return sameMediaStep(view.mediaControl, step) ? view.mediaControl : null;
}
