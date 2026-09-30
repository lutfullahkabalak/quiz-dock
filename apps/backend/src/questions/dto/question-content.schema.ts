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
  normalizeAnswer,
} from '@quiz-dock/contracts';
