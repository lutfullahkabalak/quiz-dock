/**
 * Présentation des options de réponse (couleur), partagée par les écrans live,
 * l'éditeur, ses aperçus et les modèles.
 *
 * Ce sont des couleurs *métier* (l'identité d'une réponse, façon quadrant Kahoot),
 * pilotées par la donnée `option.color` — pas des états d'UI. Elles restent donc
 * sur la palette Tailwind brute plutôt que sur les tokens sémantiques du thème.
 */

/** Couleur de fond par option. */
export const COLOR_BG: Record<string, string> = {
  red: 'bg-red-600',
  blue: 'bg-blue-600',
  yellow: 'bg-amber-500',
  green: 'bg-green-600',
  purple: 'bg-purple-600',
  orange: 'bg-orange-500',
  pink: 'bg-pink-600',
  teal: 'bg-teal-600',
};

/** Repli quand l'option n'a pas de couleur connue. */
export const OPTION_BG_FALLBACK = 'bg-slate-600';

/** Text colour matching `COLOR_BG` (glyphs, labels on a neutral ground). */
export const COLOR_TEXT: Record<string, string> = {
  red: 'text-red-600',
  blue: 'text-blue-600',
  yellow: 'text-amber-500',
  green: 'text-green-600',
  purple: 'text-purple-600',
  orange: 'text-orange-500',
  pink: 'text-pink-600',
  teal: 'text-teal-600',
};
/** Tinted track behind a distribution bar, same hue at low opacity. */
export const COLOR_BG_SOFT: Record<string, string> = {
  red: 'bg-red-600/15',
  blue: 'bg-blue-600/15',
  yellow: 'bg-amber-500/15',
  green: 'bg-green-600/15',
  purple: 'bg-purple-600/15',
  orange: 'bg-orange-500/15',
  pink: 'bg-pink-600/15',
  teal: 'bg-teal-600/15',
};
