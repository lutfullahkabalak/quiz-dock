/**
 * Présentation des options de réponse (couleur), partagée par les écrans live,
 * l'éditeur, ses aperçus et les modèles.
 *
 * Ce sont des couleurs *métier* (l'identité d'une réponse, façon quadrant Kahoot),
 * pilotées par la donnée `option.color`, pas des états d'UI : un jeton chacune
 * (`--answer-red`…, `index.css`), qu'une instance peut changer dans `override.css`.
 */

/** Couleur de fond par option. */
export const COLOR_BG: Record<string, string> = {
  red: 'bg-answer-red',
  blue: 'bg-answer-blue',
  yellow: 'bg-answer-yellow',
  green: 'bg-answer-green',
  purple: 'bg-answer-purple',
  orange: 'bg-answer-orange',
  pink: 'bg-answer-pink',
  teal: 'bg-answer-teal',
};

/** Repli quand l'option n'a pas de couleur connue. */
export const OPTION_BG_FALLBACK = 'bg-answer-none';

/** Text colour matching `COLOR_BG` (glyphs, labels on a neutral ground). */
export const COLOR_TEXT: Record<string, string> = {
  red: 'text-answer-red',
  blue: 'text-answer-blue',
  yellow: 'text-answer-yellow',
  green: 'text-answer-green',
  purple: 'text-answer-purple',
  orange: 'text-answer-orange',
  pink: 'text-answer-pink',
  teal: 'text-answer-teal',
};
/** Tinted track behind a distribution bar, same hue at low opacity. */
export const COLOR_BG_SOFT: Record<string, string> = {
  red: 'bg-answer-red/15',
  blue: 'bg-answer-blue/15',
  yellow: 'bg-answer-yellow/15',
  green: 'bg-answer-green/15',
  purple: 'bg-answer-purple/15',
  orange: 'bg-answer-orange/15',
  pink: 'bg-answer-pink/15',
  teal: 'bg-answer-teal/15',
};
