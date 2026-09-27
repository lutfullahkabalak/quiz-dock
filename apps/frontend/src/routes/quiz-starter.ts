import type { SlideGradient } from '@quiz-dock/contracts';
import { questionsControllerAdd } from '../api/generated/questions/questions';
import { slidesControllerAdd } from '../api/generated/slides/slides';

/** Colour pairs a new quiz's intro may open on: dark enough for light text. */
const GRADIENTS: [string, string][] = [
  ['#1e3a8a', '#0f172a'],
  ['#4c1d95', '#1e1b4b'],
  ['#065f46', '#022c22'],
  ['#9a3412', '#431407'],
  ['#be123c', '#4c0519'],
  ['#0e7490', '#082f49'],
  ['#6d28d9', '#be185d'],
  ['#0f766e', '#1e3a8a'],
];

/** A gradient drawn at random from the pairs, along a random angle. */
export function randomGradient(random: () => number = Math.random): SlideGradient {
  const colors = GRADIENTS[Math.floor(random() * GRADIENTS.length)];
  return { angle: 90 + Math.round(random() * 18) * 10, colors: [...colors] };
}

/**
 * A new quiz is not a blank page: an intro slide naming it — `{title}` and
 * `{description}` follow the quiz as the author renames it — on a gradient
 * drawn at random, then a first multiple choice question to complete. The quiz
 * stays a draft.
 */
export async function addStarter(
  quizId: string,
  texts: { prompt: string; answer1: string; answer2: string },
): Promise<void> {
  await slidesControllerAdd(quizId, {
    blocks: [
      { type: 'heading', id: 'starter-title', text: '{title}', level: 1, align: 'center' },
      { type: 'text', id: 'starter-text', md: '{description}', align: 'center', size: 'large' },
    ],
    gradient: randomGradient(),
    textTone: 'light',
    textOutline: true,
  });
  await questionsControllerAdd(quizId, {
    type: 'single_choice',
    prompt: texts.prompt,
    options: [
      { text: texts.answer1, color: 'red', shape: 'triangle', isCorrect: true },
      { text: texts.answer2, color: 'blue', shape: 'diamond', isCorrect: false },
    ],
  });
}
