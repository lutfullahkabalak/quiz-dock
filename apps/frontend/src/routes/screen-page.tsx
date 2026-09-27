import { RoomStandingsPanel, roomLabel } from '../game/room-components';
import { useParams } from '@tanstack/react-router';
import { Maximize, Minimize, Users } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFullscreen } from '@/lib/use-fullscreen';
import { clearRoomPositions } from '../game/media/media-position';
import { Avatar } from '../game/avatar';
import {
  ConnectionLost,
  AnswerExplanation,
  AnswerRules,
  LeaderboardList,
  OptionGrid,
  QuestionClockBar,
  Podium,
  RevealAnswer,
  SlideView,
  TYPE_BASE,
} from '../game/live-components';
import { unlockAudio, useAudioUnlocked } from '../game/media/audio-unlock';
import { useDeviceSound } from '../game/media/audio-mixer';
import { SoundButton } from '../game/media/sound-button';
import { useGameSounds } from '../game/media/game-sounds';
import { preloadMedia, waitedFor } from '../game/media/media-pool';
import { QuestionMediaStage } from '../game/media/question-media-stage';
import { SlidePlaybackContext } from '../game/media/slide-media';
import { RoomVariables } from '../game/slide-variables';
import { ReadinessMeter } from '../game/media/readiness-meter';
import { anchorOf, followed } from '../game/media/followed';
import { SoundUnlockOverlay } from '../game/media/sound-unlock-overlay';
import { Surface } from '../game/surface';
import { ImageChoiceGrid } from '../game/image-choice';
import { useQuestionClock } from '../game/use-countdown';
import { joinHostLabel, joinUrlFor } from '../game/join-url';
import { type GameView, useGameSession } from '../game/use-game-session';
import type { GameSocket } from '../game/game-client';
import { playsSound } from '@quiz-dock/contracts';

/**
 * The states where the question is on screen, drawn on its background. Not the
 * wait for the next one, the podium or the end: those keep the page's colours.
 */
const QUESTION_STATES = new Set<string>(['QUESTION_SHOW', 'ANSWERING', 'REVEAL', 'LEADERBOARD']);

/**
 * Écran de jeu projeté (grand écran, §4). Socket **spectateur** en lecture seule :
 * aucune auth, le PIN suffit, jamais de bonne réponse avant le reveal (anti-triche §7).
 * Se reconnecte seul au rechargement (le PIN est dans l'URL). Plein écran pour la
 * vidéoprojection.
 */
export function ScreenPage() {
  const { pin } = useParams({ from: '/session/$pin/projection' });
  return <ScreenView pin={pin} playMedia />;
}

/**
 * A participant's copy of the projection (#104), opened from the link they
 * shared: it follows the big screen; `?sound=1` (a remote participant) plays
 * the sound meant for remote devices, after this device's own unlocking click.
 */
export function FollowScreenPage() {
  const { pin } = useParams({ from: '/join/$pin/screen' });
  const sound = new URLSearchParams(window.location.search).get('sound') === '1';
  return <ScreenView pin={pin} follow={{ sound }} />;
}

/**
 * How a projected screen takes part:
 * - `lead` — the projection window: it plays the media and tells the room where
 *   it is in the sound;
 * - `preview` — the console's Projection tab: media shown still, or the room
 *   would hear everything twice;
 * - `follow` — a participant's copy (#104): it plays along with the projection's
 *   position, muted unless `sound`, never waited for and never a position source.
 */
export type ScreenRole = 'lead' | 'preview' | 'follow';

/**
 * The projected screen itself, also opened by a participant on a device of their
 * own (`follow`). The host console's Projection tab shows `ScreenSurface`
 * (`preview`) on the console's own session.
 */
export function ScreenView({
  pin,
  playMedia = false,
  follow,
}: {
  pin: string;
  playMedia?: boolean;
  /** A participant's copy (#104); `sound` when it plays the sound (a remote participant). */
  follow?: { sound: boolean };
}) {
  const session = useGameSession(pin, 'spectator', { follow: !!follow });
  return (
    <>
      <ConnectionLost lost={session.view.connectionLost} />
      <ScreenSurface
        pin={pin}
        view={session.view}
        socket={session.socket}
        role={follow ? 'follow' : playMedia ? 'lead' : 'preview'}
        sound={follow?.sound ?? true}
      />
    </>
  );
}

/**
 * The projected screen for a game view already followed — a projection's own,
 * or a participant's when they switch their phone to the screen (#104).
 */
export function ScreenSurface({
  pin,
  view,
  socket,
  role,
  sound = true,
  embedded = false,
}: {
  pin: string;
  view: GameView;
  socket: GameSocket | null;
  role: ScreenRole;
  /** Whether a `follow` copy plays the sound (the others decide by their role). */
  sound?: boolean;
  /**
   * Shown inside a participant's page (their switch to the big screen): no fullscreen,
   * which would hide the way back to their answers.
   */
  embedded?: boolean;
}) {
  const { t } = useTranslation('live');
  const playMedia = role === 'lead';
  // The projection tells the room where it is in the sound (the playheads elsewhere follow):
  // a question's, or the slide's on screen (#125).
  const onSlide = view.state === 'SLIDE_SHOW' && !!view.slide;
  const questionIndex = onSlide
    ? (view.slide?.questionIndex ?? -1)
    : (view.question?.questionIndex ?? -1);
  const slideIndex = onSlide ? view.slide?.slideIndex : undefined;
  const sayPosition = useCallback(
    (t: number, playing: boolean) =>
      socket?.emit('media:position', {
        pin,
        questionIndex,
        ...(slideIndex !== undefined ? { slideIndex } : {}),
        t,
        playing,
      }),
    [socket, pin, questionIndex, slideIndex],
  );
  const soundUnlocked = useAudioUnlocked();
  const deviceSound = useDeviceSound();
  // The game's sounds (#93): the projection, and a copy that plays the sound for a
  // remote participant when the room's sound reaches remote devices.
  const soundsOn =
    !!view.sounds && (view.sounds.tick || view.sounds.gong || !!view.sounds.musicUrl);
  // A new lobby, a new game: the media positions of the room's last one are gone
  // (its PIN stays; a quiz played again would read "played to the end" and stay silent).
  useEffect(() => {
    if (view.state === 'LOBBY') clearRoomPositions(pin);
  }, [view.state, pin]);
  useGameSounds(
    view.sounds,
    {
      state: view.state,
      questionIndex: view.questionIndex,
      answered: view.answerCount?.answered ?? 0,
      paused: view.paused,
      media: view.question?.media,
      mediaStartAt: view.question?.mediaStartAt ?? null,
      endsAt: view.question?.endsAt ?? null,
      startedAt: view.question?.startedAt ?? null,
      anchor: view.question && anchorOf(view, { questionIndex: view.question.questionIndex }),
    },
    role === 'lead' || (role === 'follow' && sound && view.gameAudioTarget !== 'projection'),
  );

  // In the lobby and while the leaderboard is up, what comes next buffers here;
  // the console hears when it is ready to play.
  useEffect(() => {
    const next = view.preload;
    if (role === 'preview' || !next) return;
    let cancelled = false;
    void preloadMedia(next.media, next.images, next.videos).then((loaded) => {
      // A copy fetches ahead too, but is never waited for: it says nothing.
      if (!cancelled && loaded && playMedia && waitedFor(next.media, next.videos)) {
        socket?.emit('media:ready', {
          pin,
          questionIndex: next.questionIndex,
          ...(next.slideIndex !== undefined ? { slideIndex: next.slideIndex } : {}),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [role, playMedia, view.preload, socket, pin]);
  const { ref, isFullscreen, toggle, supported } = useFullscreen<HTMLDivElement>();
  const clock = useQuestionClock(view);

  const joinUrl = joinUrlFor(view, pin);
  const joinHost = joinHostLabel(view);

  // Rappel d'invitation (QR + PIN) ancré en bas de l'écran projeté : permet aux
  // retardataires de rejoindre en cours de question (notamment quand l'énoncé n'a
  // pas d'options affichées à l'écran, cf. « Réponds sur ton téléphone »).
  const joinBar = (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[1em] border-t bg-background/80 p-[1em] backdrop-blur">
      <div className="rounded-md bg-white p-1.5 shadow">
        <QRCodeSVG value={joinUrl} size={80} aria-label={t('screen.qrLabel')} />
      </div>
      <div className="flex flex-col items-start">
        <span className="text-muted-foreground text-[0.8em] uppercase tracking-widest">
          {joinHost}
        </span>
        <span className="font-mono text-[2.25em] font-bold tracking-[0.2em]">{pin}</span>
      </div>
    </div>
  );

  // This screen's own sound (#93): the projection, or a copy that plays it.
  const soundButton = role === 'lead' || (role === 'follow' && sound);

  const fullscreenBtn =
    supported && !embedded ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        aria-label={isFullscreen ? t('screen.exitFullscreen') : t('screen.fullscreen')}
        onClick={() => void toggle()}
      >
        {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
      </Button>
    ) : null;

  const counter =
    view.answerCount && view.state === 'ANSWERING' ? (
      <p className="text-muted-foreground text-[1.25em]">
        {t('screen.answersReceived')}{' '}
        <span className="tabular-nums">
          {view.answerCount.answered} / {view.answerCount.total}
        </span>
      </p>
    ) : null;

  let body: React.ReactNode;

  if (view.status === 'error') {
    body = <p className="text-muted-foreground">{view.error ?? t('screen.sessionUnavailable')}</p>;
  } else if (view.state === 'HOST_DISCONNECTED') {
    body = <p className="text-[2em] font-semibold">{t('screen.paused')}</p>;
  } else if (view.state === 'MEDIA_LOADING') {
    // A device that plays the coming question's sound or video is still loading it.
    body = (
      <div className="flex flex-col items-center gap-[1em]">
        <p className="text-[2em] font-semibold">{t('screen.mediaLoading')}</p>
        <ReadinessMeter
          readiness={view.readiness}
          until={view.mediaWait?.until ?? null}
          className="text-[1.25em]"
        />
      </div>
    );
  } else if (view.state === 'ENDED') {
    // A room that played several quizzes closes on its own podium (#89).
    const series = view.standings && view.standings.quizzesPlayed > 1 ? view.standings : null;
    body = series ? (
      <div className="flex w-full max-w-[28em] flex-col items-center gap-[1.5em]">
        <h2 className="text-[2em] font-bold">{t('screen.roomPodium')}</h2>
        <p className="text-muted-foreground text-[1.25em]">
          {t('room.afterQuizzes', { count: series.quizzesPlayed })}
        </p>
        <Podium rows={series.top.slice(0, 3)} />
        <p className="text-[1.5em] font-semibold">{t('screen.thanks')}</p>
      </div>
    ) : (
      <p className="text-[2em] font-semibold">{t('screen.thanks')}</p>
    );
  } else if (view.state === 'SLIDE_SHOW' && view.slide) {
    const slide = view.slide;
    const step = { questionIndex: slide.questionIndex, slideIndex: slide.slideIndex };
    // A copy hears the slide only when asked to, and when its sound reaches remote devices.
    const copyHears =
      role === 'follow' && sound && !!slide.audioTarget && playsSound(slide.audioTarget, 'remote');
    body = (
      <div className="flex min-h-dvh w-full flex-1">
        {/* Its videos and sound play as a question's do (#125): here, on the common start. */}
        <SlidePlaybackContext.Provider
          value={{
            mode: role === 'preview' || view.nav?.review ? 'still' : view.paused ? 'pause' : 'play',
            audible: role !== 'follow' || copyHears,
            startAt: slide.mediaStartAt ?? null,
            anchor: anchorOf(view, step),
            resumeKey: playMedia ? `${pin}:s${slide.slideIndex}` : null,
            follow: playMedia || copyHears ? undefined : followed(view, step),
            catchUp: role === 'follow' ? followed(view, step) : undefined,
            onPosition: playMedia ? sayPosition : undefined,
          }}
        >
          <RoomVariables view={view} pin={pin}>
            <SlideView key={slide.slideIndex} slide={slide} />
          </RoomVariables>
        </SlidePlaybackContext.Provider>
      </div>
    );
  } else if (view.state === 'PODIUM' && view.podium) {
    body = (
      <div className="flex w-full max-w-[28em] flex-col items-center gap-[1.5em]">
        <h2 className="text-[2em] font-bold">{t('screen.podium')}</h2>
        <Podium rows={view.podium.podium} />
        {/* Then the room's standings (#89) once it has played more than one quiz. */}
        {view.standings && view.standings.quizzesPlayed > 1 ? (
          <RoomStandingsPanel standings={view.standings} className="text-[1.1em]" />
        ) : view.leaderboard && view.leaderboard.top.length > 3 ? (
          <div className="flex w-full flex-col gap-[0.5em]">
            <h3 className="text-muted-foreground text-[1.25em] font-semibold">
              {t('screen.overallRanking')}
            </h3>
            <LeaderboardList rows={view.leaderboard.top} />
          </div>
        ) : null}
        {view.podium.credits?.length ? (
          // Small, but seen by the room: the attribution a CC-BY licence asks for.
          <p className="text-muted-foreground text-center text-[0.8em]">
            {t('screen.credits')} {view.podium.credits.join(' · ')}
          </p>
        ) : null}
      </div>
    );
  } else if (view.state === 'REVEAL' && view.question?.type === 'image_choice' && view.reveal) {
    // The pictures stay where they were: the wrong ones dimmed, the right one(s)
    // forward, each with its count — the grid fills the screen as during the question.
    body = (
      <div className="flex min-h-0 w-full max-w-[80em] flex-1 flex-col items-center gap-[1em]">
        <Markdown
          role="heading"
          aria-level={1}
          className="shrink-0 text-center text-[2em] font-semibold"
        >
          {view.question.prompt}
        </Markdown>
        <ImageChoiceGrid
          fit="screen"
          className="flex-1"
          options={view.question.options ?? []}
          correctIds={view.reveal.correctOptionIds ?? []}
          counts={view.reveal.distribution}
        />
        <AnswerExplanation reveal={view.reveal} />
      </div>
    );
  } else if ((view.state === 'REVEAL' || view.state === 'LEADERBOARD') && view.question) {
    body = (
      <div className="flex w-full max-w-[40em] flex-col items-center gap-[1.5em]">
        <Markdown role="heading" aria-level={1} className="text-center text-[2em] font-semibold">
          {view.question.prompt}
        </Markdown>
        {view.reveal ? <RevealAnswer question={view.question} reveal={view.reveal} /> : null}
        {view.reveal ? <AnswerExplanation reveal={view.reveal} /> : null}
        {view.leaderboard ? (
          <div className="flex w-full max-w-[28em] flex-col gap-[0.5em]">
            <h3 className="text-muted-foreground font-semibold">{t('screen.leaderboard')}</h3>
            <LeaderboardList rows={view.leaderboard.top} />
          </div>
        ) : null}
      </div>
    );
  } else if ((view.state === 'ANSWERING' || view.state === 'QUESTION_SHOW') && view.question) {
    const visual = !!view.question.media?.visual;
    // A copy hears the question only when asked to (a remote participant) and when
    // its sound is meant for remote devices.
    const copyHears =
      role === 'follow' &&
      sound &&
      !!view.question.audioTarget &&
      playsSound(view.question.audioTarget, 'remote');
    const images = view.question.type === 'image_choice';
    // Nobody scrolls a projector: the page is the screen's height, the answers keep
    // their room and the picture takes what is left (#92).
    body = (
      <div className="flex min-h-0 w-full max-w-[64em] flex-1 flex-col items-center gap-[1em]">
        {clock ? (
          <QuestionClockBar
            clock={clock}
            // Clear of the fullscreen button, top right, and of the sound button, top left.
            className={cn('shrink-0 pr-[2.5em] text-[1.6em]', soundButton && 'pl-[2.5em]')}
          />
        ) : null}
        {/* Under the clock: centred when short, the picture filling what is left otherwise. */}
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[1em]">
          <Markdown
            role="heading"
            aria-level={1}
            className="w-full shrink-0 text-[1.8em] leading-tight font-semibold"
          >
            {view.question.prompt}
          </Markdown>
          {/* Image or video in one box, the sound as its waveform; played here only. */}
          <QuestionMediaStage
            key={view.question.questionIndex}
            media={view.question.media}
            mode={role === 'preview' || view.nav?.review ? 'still' : view.paused ? 'pause' : 'play'}
            // A copy plays the sound only when asked (a remote participant), and only
            // when the question's sound is for remote devices.
            audible={role !== 'follow' || copyHears}
            className={visual ? 'min-h-[6em] flex-1' : 'shrink-0'}
            boxClassName={visual ? 'aspect-auto h-full min-h-0 w-full flex-1' : undefined}
            resumeKey={playMedia ? `${pin}:${view.question.questionIndex}` : null}
            // The projection plays on its own; the console's tab draws its position; a copy
            // that plays the sound starts on the common instant and catches up with it,
            // as a remote participant's phone does.
            follow={
              playMedia || copyHears
                ? undefined
                : followed(view, { questionIndex: view.question.questionIndex })
            }
            catchUp={
              role === 'follow'
                ? followed(view, { questionIndex: view.question.questionIndex })
                : undefined
            }
            onPosition={playMedia ? sayPosition : undefined}
            startAt={view.question.mediaStartAt ?? null}
            anchor={anchorOf(view, { questionIndex: view.question.questionIndex })}
          />
          <AnswerRules question={view.question} className="shrink-0" />
          {images ? (
            // No picture of its own: the pictures are the answers, and take what is left.
            <ImageChoiceGrid
              fit="screen"
              className="min-h-[8em] flex-1"
              options={view.question.options ?? []}
            />
          ) : view.question.options?.length ? (
            <div className="w-full shrink-0">
              <OptionGrid options={view.question.options} />
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-[1.5em]">{t('screen.answerOnPhone')}</p>
              {joinBar}
            </>
          )}
          <div className="shrink-0">{counter}</div>
        </div>
      </div>
    );
  } else {
    // LOBBY (et état initial) : invitation à rejoindre + liste des joueurs (§4.1).
    // The room's next quiz (#89): what comes, and where the room stands.
    const nextInRoom = view.standings ? view.standings : null;
    body = (
      <div className="flex flex-col items-center gap-[1.5em]">
        {/* The room's name, then the quiz it plays (the next one, from its second). */}
        <h1 className="text-[2.25em] font-bold">{roomLabel(t, view.roomName, view.hostName)}</h1>
        {view.quizTitle ? (
          <p className="-mt-[1em] text-[1.5em]">
            <span className="text-muted-foreground">
              {nextInRoom ? t('screen.nextQuiz') : t('screen.quizLabel')}
            </span>{' '}
            <span className="font-semibold">{view.quizTitle}</span>
          </p>
        ) : null}
        <p className="text-[1.5em]">
          {t('screen.joinAt')} <span className="font-semibold">{joinHost}</span>
        </p>
        <p className="font-mono text-[4em] font-bold tracking-[0.3em]">{pin}</p>
        <div className="rounded-xl bg-white p-4 shadow">
          <QRCodeSVG value={joinUrl} size={200} aria-label={t('screen.qrLabel')} />
        </div>
        <div className="text-muted-foreground flex items-center gap-[0.5em] text-[1.25em]">
          <Users className="size-[1em]" />
          <span data-testid="player-count">{view.players.length}</span>
          <span>{t('screen.participants', { count: view.players.length })}</span>
        </div>
        {/* The first question's sound or video, loaded on the devices that will play it. */}
        {view.readiness?.questionIndex === 0 ? (
          <ReadinessMeter readiness={view.readiness} className="text-[1em]" />
        ) : null}
        <ul className="flex max-w-[40em] flex-wrap justify-center gap-[0.5em]">
          {view.players.map((p) => (
            <li
              key={p.playerId}
              className="flex items-center gap-[0.5em] rounded-full border py-[0.25em] pl-[0.25em] pr-[0.75em] text-[1.1em]"
            >
              <Avatar name={p.avatar || p.nickname} size="2em" />
              {p.nickname}
            </li>
          ))}
        </ul>
        {nextInRoom ? (
          <RoomStandingsPanel
            standings={nextInRoom}
            max={5}
            className="max-w-[28em] text-[1.1em]"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        'bg-background relative flex min-h-dvh flex-col',
        // A question fits the screen exactly (see its body); the rest may grow.
        (view.state === 'ANSWERING' ||
          view.state === 'QUESTION_SHOW' ||
          // An image choice's reveal keeps its grid on the screen, as the question did.
          (view.state === 'REVEAL' && view.question?.type === 'image_choice')) &&
          'h-dvh',
        // One typographic base for the whole projected page; everything inside is in em.
        TYPE_BASE.screen,
        // A slide owns the whole surface; everything else is centred with breathing room.
        view.state === 'SLIDE_SHOW'
          ? 'items-stretch justify-stretch p-0'
          : 'items-center justify-center gap-[1.5em] p-[1.5em] text-center',
      )}
    >
      {fullscreenBtn}
      {soundButton ? (
        <SoundButton
          size="lg"
          align="start"
          className="absolute top-4 left-4 z-40"
          onUnmute={() => void unlockAudio()}
        />
      ) : null}
      {/* A quiz with sound asks for the unlocking click as soon as this window opens,
          whatever the moment of the session; a silent quiz never asks. */}
      {(playMedia || (role === 'follow' && sound)) &&
      !soundUnlocked &&
      !deviceSound.muted &&
      (view.quizHasSound || soundsOn) &&
      view.state !== 'ENDED' ? (
        <SoundUnlockOverlay />
      ) : null}
      {view.nav?.review ? (
        // Top centre: the sound button holds the top left corner.
        <span className="bg-muted text-muted-foreground absolute left-1/2 top-[1em] z-20 -translate-x-1/2 rounded-full px-[0.8em] py-[0.3em] text-[0.8em] font-medium">
          {t('screen.review')}
        </span>
      ) : null}
      {view.question?.background && view.state && QUESTION_STATES.has(view.state) ? (
        // A question with a background owns the surface like a slide does.
        <Surface
          background={view.question.background}
          textTone={view.question.textTone}
          textOutline={view.question.textOutline}
          className="absolute inset-0 flex items-center justify-center p-[2em]"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-[1.5em]">
            {body}
          </div>
        </Surface>
      ) : (
        body
      )}
    </div>
  );
}
