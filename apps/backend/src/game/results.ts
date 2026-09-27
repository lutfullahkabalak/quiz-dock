import type {
  LeaderboardPayload,
  LeaderboardRow,
  PodiumPayload,
  QuestionRevealPayload,
} from '@quiz-dock/contracts';
import type { AnswerRecord, PlayerRecord, PlayerScore, QuizSnapshot } from './game.types';

/**
 * A game's results as each device is sent them: the part every device shares
 * (top rows, podium, common reveal) and the line of the socket's own player.
 * Pure: the engine reads Redis, these shape the payloads.
 */

export type RankedPlayer = PlayerRecord & PlayerScore & { id: string };

/** The players of a game ranked, with an index by id: computed once per event, read per socket. */
export interface Ranking {
  ranked: RankedPlayer[];
  /** playerId → rank (1-based) and the player. */
  byId: Map<string, { rank: number; player: RankedPlayer }>;
  /** Top 10, as every device shows it. */
  top: LeaderboardRow[];
}

/**
 * The players of a game, by score then arrival (§5): those of the room (`players`,
 * JSON records) who play it (`scores`, JSON scores), with what they scored in it.
 */
export function rankPlayers(
  players: Record<string, string>,
  scores: Record<string, string>,
): RankedPlayer[] {
  return Object.entries(scores)
    .filter(([id]) => players[id])
    .map(([id, score]) => ({
      id,
      ...(JSON.parse(players[id]) as PlayerRecord),
      ...(JSON.parse(score) as PlayerScore),
    }))
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}

export function rankingOf(ranked: RankedPlayer[]): Ranking {
  return {
    ranked,
    byId: new Map(ranked.map((player, i) => [player.id, { rank: i + 1, player }])),
    top: topRows(ranked),
  };
}

/** The first `limit` rows of a ranking, as shown publicly (no personal rank). */
export function topRows(
  ranked: Pick<RankedPlayer, 'nickname' | 'score' | 'avatar'>[],
  limit = 10,
): LeaderboardRow[] {
  return ranked
    .slice(0, limit)
    .map((p, i) => ({ nickname: p.nickname, score: p.score, rank: i + 1, avatar: p.avatar }));
}

/** The socket's own score and rank, when it is a player of the game. */
function yourLine(ranking: Ranking, playerId: string | undefined) {
  const me = playerId ? ranking.byId.get(playerId) : undefined;
  return me ? { score: me.player.score, rank: me.rank } : undefined;
}

/** The common reveal, plus `yourResult` for the socket's player (if it has one). */
export function personalReveal(
  common: QuestionRevealPayload,
  records: Map<string, AnswerRecord>,
  ranking: Ranking,
  playerId: string | undefined,
): QuestionRevealPayload {
  const you = yourLine(ranking, playerId);
  if (!you) return { ...common };
  const rec = records.get(playerId!);
  return {
    ...common,
    yourResult: {
      correct: rec?.isCorrect ?? false,
      points: rec?.pointsAwarded ?? 0,
      totalScore: you.score,
      rank: you.rank,
      ...(rec?.credit !== undefined && rec.credit > 0 && rec.credit < 1
        ? { credit: rec.credit }
        : {}),
      ...(rec?.closestRank !== undefined
        ? { closestRank: rec.closestRank, distance: rec.distance }
        : {}),
    },
  };
}

/** The public top 10, plus `you` for the socket's player (if it has one). */
export function personalLeaderboard(
  ranking: Ranking,
  playerId: string | undefined,
): LeaderboardPayload {
  return { top: ranking.top, you: yourLine(ranking, playerId) };
}

/** The top 3, plus `you` for the socket's player (if it has one). */
export function personalPodium(
  ranking: Ranking,
  playerId: string | undefined,
  snapshot: QuizSnapshot | null,
): PodiumPayload {
  return {
    podium: topRows(ranking.ranked, 3),
    ...(snapshot ? { quizId: snapshot.quizId } : {}),
    feedbackEnabled: snapshot?.feedbackEnabled ?? true,
    ...(snapshot?.credits?.length ? { credits: snapshot.credits } : {}),
    you: yourLine(ranking, playerId),
  };
}
