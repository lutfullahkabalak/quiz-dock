import { GameState } from '@quiz-dock/contracts';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameView } from '../game/use-game-session';
import { renderApp } from '../test/harness';

const { fakeSocket, hookState } = vi.hoisted(() => ({
  fakeSocket: { emit: vi.fn(), once: vi.fn(), off: vi.fn(), on: vi.fn() },
  hookState: { value: null as unknown },
}));

vi.mock('../game/use-game-session', () => ({
  useGameSession: () => ({ view: hookState.value, socket: fakeSocket, markJoined: vi.fn() }),
}));

const view = (partial: Partial<GameView>): GameView => ({
  status: 'ready',
  error: null,
  state: GameState.Lobby,
  questionIndex: -1,
  totalQuestions: 0,
  question: null,
  slide: null,
  answerCount: null,
  reveal: null,
  result: null,
  leaderboard: null,
  podium: null,
  feedbackEnabled: true,
  players: [],
  answerAccepted: null,
  answerRefusal: null,
  answerAckAt: null,
  lobbyCount: null,
  fullCapture: false,
  personalTracking: true,
  pickOwnName: true,
  participantAccess: 'account',
  joinLocked: false,
  kicked: null,
  connectionLost: false,
  mode: 'manual',
  paused: false,
  pausedRemainingMs: null,
  autoNextAt: null,
  autoNextMs: null,
  quizTitle: null,
  quizId: null,
  quizDescription: null,
  outline: [],
  preload: null,
  mediaControl: null,
  quizHasSound: null,
  gameAudioTarget: null,
  quizHasMedia: null,
  readiness: null,
  mediaPosition: null,
  mediaWait: null,
  nav: null,
  joinBaseUrl: null,
  youReady: false,
  sounds: null,
  roomName: null,
  hostName: null,
  standings: null,
  rateable: null,
  ...partial,
});

/** A question drawn on a gradient, as the projection received it. */
const withBackground = {
  questionIndex: 0,
  type: 'single_choice',
  prompt: 'Sur fond ?',
  options: [],
  startedAt: 0,
  endsAt: 0,
  timeLimitS: 20,
  background: { gradient: { angle: 90, colors: ['#ff0000', '#0000ff'] } },
  textTone: 'light',
  textOutline: true,
} as never;

const gradientOnScreen = () =>
  [...document.querySelectorAll<HTMLElement>('[style]')].some((el) =>
    el.style.backgroundImage.includes('linear-gradient'),
  );

describe('ScreenPage (projection)', () => {
  afterEach(() => vi.clearAllMocks());

  it('draws a question on its background while it is played (audit F15)', async () => {
    hookState.value = view({
      state: GameState.Answering,
      questionIndex: 0,
      question: withBackground,
    });
    renderApp('/session/482913/projection');
    await screen.findByText('Sur fond ?');
    expect(gradientOnScreen()).toBe(true);
  });

  it('says over the screen that its connection is lost (audit F9)', async () => {
    hookState.value = view({
      state: GameState.Answering,
      questionIndex: 0,
      question: withBackground,
      connectionLost: true,
    });
    renderApp('/session/482913/projection');
    expect(await screen.findByRole('status')).toHaveTextContent('Connexion perdue');
  });

  it('never draws the podium on the last question’s background (audit F15)', async () => {
    hookState.value = view({
      state: GameState.Podium,
      questionIndex: 0,
      question: withBackground,
      podium: {
        podium: [{ nickname: 'Ann', score: 900, rank: 1 }],
        feedbackEnabled: true,
      } as never,
    });
    renderApp('/session/482913/projection');
    await screen.findByText('Ann');
    expect(gradientOnScreen()).toBe(false);
  });
});
