/**
 * The question contract lives in `@quiz-dock/contracts`: the editor validates with
 * the same schema (structure) and the same checks (completeness) as the server.
 */
export {
  OPTION_COLORS,
  OPTION_SHAPES,
  OPTIONS_MAX,
  OPTIONS_MIN,
  POINTS_MODES,
  QUESTION_TYPES,
  SCORING_BY_TYPE,
  type QuestionContent,
  questionContentSchema,
  questionIssues,
} from '@quiz-dock/contracts';

/**
 * Normalise une réponse texte pour comparaison (RG-06) : minuscule, sans accent,
 * espaces superflus retirés. Calculé côté serveur (le client n'envoie que `text`).
 */
export function normalizeAnswer(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
