import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/harness';

const ENTRY = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  title: 'Ports du monde',
  description: 'Les grands ports',
  language: 'fr',
  tags: ['geo'],
  questionCount: 10,
  license: 'CC-BY-4.0',
  coverUrl: null,
  author: { name: 'Alice', subject: 'local:alice' },
  revision: 2,
  sharedAt: '2026-09-23T08:00:00.000Z',
};

/** #39 — taking a template must read as "a copy lands in my bank", never as sharing access. */
describe('TemplatesPage (galerie)', () => {
  it('montre une carte par modèle, avec sa vignette et son auteur', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([{ method: 'GET', path: '/store', body: [ENTRY] }]);
    renderApp('/templates');

    expect(await screen.findByText('Ports du monde')).toBeInTheDocument();
    expect(screen.getByText(/partagé par Alice/)).toBeInTheDocument();
    expect(screen.getByText('10 questions')).toBeInTheDocument();
    // La carte mène à l'aperçu : c'est là qu'on décide.
    expect(screen.getByRole('link', { name: /Ports du monde/ })).toHaveAttribute(
      'href',
      `/templates/${ENTRY.id}`,
    );
    localStorage.clear();
  });

  it('narrows by tag and language, and shows as a list when asked', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([
      {
        method: 'GET',
        path: '/store',
        body: [
          ENTRY,
          { ...ENTRY, id: '01ARZ3NDEKTSV4RRFFQ69G5FAW', title: 'Fromages', tags: ['food'] },
          { ...ENTRY, id: '01ARZ3NDEKTSV4RRFFQ69G5FAX', title: 'World ports', language: 'en' },
        ],
      },
    ]);
    renderApp('/templates');
    expect(await screen.findByText('Fromages')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'geo' }));
    expect(screen.queryByText('Fromages')).toBeNull();
    fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } });
    expect(screen.queryByText('Ports du monde')).toBeNull();
    expect(screen.getByText('World ports')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    expect(localStorage.getItem('quizdock.templates.view')).toBe('list');
    localStorage.clear();
  });

  it('dessine la première diapositive telle qu’à l’écran, pas seulement son titre', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    const entry = {
      ...ENTRY,
      first: {
        kind: 'slide',
        text: 'Discover France',
        media: null,
        gradient: { angle: 135, colors: ['#1d3fa0', '#f5f5f5', '#d02a2a'] },
        slide: {
          blocks: [
            { type: 'heading', id: 'h', text: 'Discover France', level: 1, align: 'center' },
            { type: 'text', id: 't', md: 'Ten quick questions', align: 'center', size: 'large' },
          ],
          background: { gradient: { angle: 135, colors: ['#1d3fa0', '#f5f5f5', '#d02a2a'] } },
          textTone: 'light',
          textOutline: true,
        },
      },
    };
    mockApi([{ method: 'GET', path: '/store', body: [entry] }]);
    renderApp('/templates');

    expect(await screen.findByText('Discover France')).toBeInTheDocument();
    // The subtitle block is on the card too — the old thumbnail kept the title alone.
    expect(screen.getByText('Ten quick questions')).toBeInTheDocument();
    localStorage.clear();
  });

  it('dit qu’aucun modèle n’est partagé, et mène aux quiz d’où l’on en partage un', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([{ method: 'GET', path: '/store', body: [] }]);
    renderApp('/templates');

    expect(await screen.findByText('Aucun modèle pour l’instant')).toBeInTheDocument();
    expect(screen.getByText(/Partagez-en un depuis un quiz « prêt »/)).toBeInTheDocument();
    // The header has its own "My quizzes": the empty state's is the last one.
    const links = screen.getAllByRole('link', { name: 'Mes quiz' });
    expect(links.at(-1)).toHaveAttribute('href', '/quizzes');
    localStorage.clear();
  });

  it('permet de créer depuis la carte, sans ouvrir le modèle', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([
      {
        method: 'GET',
        path: '/me',
        body: {
          id: 'u1',
          displayName: 'Marc',
          email: null,
          roles: ['host'],
          subject: 'local:marc',
        },
      },
      { method: 'GET', path: '/store', body: [ENTRY] },
    ]);
    renderApp('/templates');

    expect(
      await screen.findByRole('button', { name: /Créer un quiz à partir de ceci/ }),
    ).toBeInTheDocument();
    localStorage.clear();
  });

  it('dit quand rien n’a encore été partagé', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([{ method: 'GET', path: '/store', body: [] }]);
    renderApp('/templates');
    expect(await screen.findByText(/Aucun modèle n’a encore été partagé/)).toBeInTheDocument();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('a catalogue that cannot be read says so, not that it is empty (audit E5)', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([{ method: 'GET', path: '/store', status: 500, body: {} }]);
    renderApp('/templates');
    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun modèle pour l’instant')).toBeNull();
    localStorage.clear();
  });
});

describe('TemplatePage (aperçu)', () => {
  const Q = `${ENTRY.id}-q0`;
  const BG = 'BGBGBGBGBGBGBGBGBGBGBGBGBG';
  // What a copy would create, in the shape of a quiz (the server reads it through the import).
  const PREVIEW = {
    ...ENTRY,
    coverUrl: null,
    questionCount: 1,
    slideCount: 1,
    invalid: null,
    media: { [BG]: `/api/v1/store/${ENTRY.id}/media/bg.webp` },
    questions: [
      {
        id: Q,
        quizId: ENTRY.id,
        orderIndex: 0,
        type: 'single_choice',
        prompt: 'Quel est le plus grand port d’Europe ?',
        media: { visual: null, audio: null },
        answerExplanation: null,
        backgroundMediaId: null,
        backgroundGradient: null,
        textTone: 'light',
        textOutline: true,
        timeLimitS: 20,
        revealDelayS: null,
        audioTarget: null,
        waveformSize: 'M',
        timerAfterMedia: false,
        pointsMode: 'standard',
        scoring: 'standard',
        numericValue: null,
        numericTolerance: null,
        multiSelect: false,
        options: [
          {
            id: 'o1',
            orderIndex: 0,
            text: 'Rotterdam',
            mediaId: null,
            alt: null,
            color: 'red',
            shape: 'triangle',
            isCorrect: true,
            correctOrderIndex: null,
          },
          {
            id: 'o2',
            orderIndex: 1,
            text: 'Anvers',
            mediaId: null,
            alt: null,
            color: 'blue',
            shape: 'diamond',
            isCorrect: false,
            correctOrderIndex: null,
          },
        ],
        acceptedAnswers: [],
      },
    ],
    slides: [
      {
        id: `${ENTRY.id}-s0`,
        quizId: ENTRY.id,
        beforeQuestionId: Q,
        orderIndex: 0,
        blocks: [{ type: 'heading', id: 'h', text: 'Bienvenue', level: 1 }],
        mediaId: BG,
        gradient: null,
        videoMediaId: null,
        videoLoop: true,
        videoSound: true,
        audioMediaId: null,
        waveformSize: 'M',
        audioTarget: null,
        textTone: 'light',
        textOutline: true,
        displayDelayS: null,
      },
    ],
  };

  const HOST = {
    id: 'u1',
    displayName: 'Marc',
    email: null,
    roles: ['host'],
    subject: 'local:marc',
  };

  it('draws the template with the quiz preview, its media served by the catalogue', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([
      { method: 'GET', path: '/me', body: HOST },
      { method: 'GET', path: `/store/${ENTRY.id}`, body: PREVIEW },
    ]);
    const { container } = renderApp(`/templates/${ENTRY.id}`);

    // The slide comes first, on its background from the catalogue.
    expect(await screen.findByRole('heading', { name: 'Bienvenue' })).toBeInTheDocument();
    expect(
      container.querySelector(`img[src="/api/v1/store/${ENTRY.id}/media/bg.webp"]`),
    ).not.toBeNull();
    fireEvent.click(screen.getByText('Suivant'));
    expect(
      screen.getByRole('heading', { name: 'Quel est le plus grand port d’Europe ?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Rotterdam')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Créer un quiz à partir de ceci/ }),
    ).toBeInTheDocument();
    // Not Alice's template, not an admin: nothing to withdraw.
    expect(screen.queryByRole('button', { name: 'Plus d’actions' })).toBeNull();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('its author withdraws it from the ⋯ menu', async () => {
    localStorage.setItem('live.localUser', 'Alice');
    mockApi([
      {
        method: 'GET',
        path: '/me',
        body: { ...HOST, displayName: 'Alice', subject: 'local:alice' },
      },
      { method: 'GET', path: `/store/${ENTRY.id}`, body: PREVIEW },
    ]);
    renderApp(`/templates/${ENTRY.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Plus d’actions' }));
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeInTheDocument();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('says what a copy would refuse, when the template does not read whole', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([
      { method: 'GET', path: '/me', body: HOST },
      {
        method: 'GET',
        path: `/store/${ENTRY.id}`,
        body: { ...PREVIEW, questions: [], slides: [], invalid: { item: 3 } },
      },
    ]);
    renderApp(`/templates/${ENTRY.id}`);
    expect(await screen.findByText(/élément 3/)).toBeInTheDocument();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('explique à un non-animateur pourquoi il ne peut pas prendre de copie', async () => {
    localStorage.setItem('live.localUser', 'Marc');
    mockApi([
      {
        method: 'GET',
        path: '/me',
        body: { id: 'u1', displayName: 'Marc', email: null, roles: [], subject: 'local:marc' },
      },
      { method: 'GET', path: `/store/${ENTRY.id}`, body: PREVIEW },
    ]);
    renderApp(`/templates/${ENTRY.id}`);

    expect(await screen.findByText(/action d’animateur/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer un quiz/ })).toBeNull();
    localStorage.clear();
    vi.unstubAllGlobals();
  });
});
