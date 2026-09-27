import type { SlideVariable } from '@quiz-dock/contracts';
import { type ReactNode, createContext } from 'react';
import { useTranslation } from 'react-i18next';
import { joinHostLabel } from './join-url';
import { roomLabel } from './room-components';
import type { GameView } from './use-game-session';

export type SlideVariableValues = Partial<Record<SlideVariable, string | number | null>>;

/**
 * The room's variables a slide may hold (`{room}`, `{pin}`, `{players}`…), as this
 * screen knows them. The quiz's are filled by the server; without a provider (the
 * builder), the room's stay as written.
 */
export const SlideVariablesContext = createContext<SlideVariableValues>({});

/** The room's variables for a live screen, kept live (a count follows the room). */
export function useRoomVariables(view: GameView, pin: string): SlideVariableValues {
  const { t, i18n } = useTranslation('live');
  const now = new Date();
  // The question the slide leads to (1-based), and what is left from it.
  const next = Math.min(view.questionIndex + 1, view.totalQuestions);
  return {
    room: roomLabel(t, view.roomName, view.hostName),
    host: view.hostName ?? '',
    pin,
    join: joinHostLabel(view),
    players: view.players.length,
    question: next,
    total: view.totalQuestions,
    remaining: Math.max(0, view.totalQuestions - view.questionIndex),
    date: now.toLocaleDateString(i18n.language),
    time: now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Gives the slides inside the room's variables. */
export function RoomVariables({
  view,
  pin,
  children,
}: {
  view: GameView;
  pin: string;
  children: ReactNode;
}) {
  return (
    <SlideVariablesContext.Provider value={useRoomVariables(view, pin)}>
      {children}
    </SlideVariablesContext.Provider>
  );
}
