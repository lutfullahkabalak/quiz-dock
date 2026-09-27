import type { GameMeta, QuizSnapshot } from './game.types';
import { navFor, parseStepKey, playedSteps, stepKey, waitedStep } from './steps';

/** Two questions; slides before the first (s0), before the second (s1), after the last (s2). */
const snapshot = {
  questions: [{}, {}],
  slides: [{ beforeQuestionIndex: 0 }, { beforeQuestionIndex: 1 }, { beforeQuestionIndex: 2 }],
} as unknown as QuizSnapshot;

const at = (state: string, currentIndex: number, over: Partial<GameMeta> = {}) =>
  ({ state, currentIndex, slideIndex: -1, reviewStep: '', ...over }) as GameMeta;

describe('steps', () => {
  it('writes and reads a step key', () => {
    expect(stepKey({ questionIndex: 3 })).toBe('q3');
    expect(stepKey({ slideIndex: 1 })).toBe('s1');
    expect(parseStepKey('s12')).toEqual({ slideIndex: 12 });
    expect(parseStepKey('q0')).toEqual({ questionIndex: 0 });
    expect(parseStepKey('x1')).toBeNull();
  });

  it('a media wait holds back the slide it precedes, else the question', () => {
    expect(waitedStep(at('MEDIA_LOADING', 1, { slideIndex: 1 }))).toEqual({
      questionIndex: 1,
      slideIndex: 1,
    });
    expect(waitedStep(at('MEDIA_LOADING', 1))).toEqual({ questionIndex: 1 });
  });

  describe('played steps', () => {
    it('counts a question once revealed, a slide once shown', () => {
      expect(playedSteps(at('ANSWERING', 0), snapshot)).toEqual(['s0']);
      expect(playedSteps(at('REVEAL', 0), snapshot)).toEqual(['s0', 'q0']);
      expect(playedSteps(at('SLIDE_SHOW', 1, { slideIndex: 1 }), snapshot)).toEqual([
        's0',
        'q0',
        's1',
      ]);
      expect(playedSteps(at('PODIUM', 2), snapshot)).toEqual(['s0', 'q0', 's1', 'q1', 's2']);
      expect(playedSteps(at('LOBBY', -1), snapshot)).toEqual([]);
    });

    it('lets the host go back from the live position, and forth while looking back', () => {
      expect(navFor(at('REVEAL', 1), snapshot)).toEqual({
        prev: { slideIndex: 1 },
        next: null,
        review: false,
      });
      expect(navFor(at('REVEAL', 1, { reviewStep: 'q0' }), snapshot)).toEqual({
        prev: { slideIndex: 0 },
        next: { slideIndex: 1 },
        review: true,
      });
      // At the podium: back to the last step played.
      expect(navFor(at('PODIUM', 2), snapshot).prev).toEqual({ slideIndex: 2 });
    });
  });
});
