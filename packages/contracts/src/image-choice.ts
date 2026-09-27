/**
 * Image choice (`image_choice`): the answers are pictures, each with the colour
 * and shape of its position, as a text answer's. One right picture, or several
 * when the question says so (`multiSelect`, scored as a multiple choice).
 *
 * The question keeps its prompt and may play a sound, but shows no picture or
 * video of its own: the answers are the pictures.
 */

/** How many pictures an image choice takes: a row of two, or two rows of two. */
export const IMAGE_CHOICE_OPTION_COUNTS = [2, 4] as const;

/**
 * Width over height of an answer tile, the picture cropped to fill it
 * (`object-fit: cover`). Provisional: to settle on a projector with pictures of
 * various proportions.
 */
export const TILE_RATIO = 4 / 3;

/** Longest alternative text of an answer's picture (as a media's). */
export const OPTION_ALT_MAX = 300;
