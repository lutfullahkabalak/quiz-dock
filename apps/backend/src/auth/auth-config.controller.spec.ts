import { AuthConfigController } from './auth-config.controller';

describe('AuthConfigController', () => {
  const controller = new AuthConfigController();
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it('renvoie le mode none par défaut (sans OIDC)', () => {
    process.env = { ...env, AUTH_MODE: 'none' };
    expect(controller.config()).toEqual({
      mode: 'none',
      communityStore: false,
      demo: null,
      standalone: false,
      anonymousParticipants: false,
    });
  });

  it('renvoie le mode oidc, sans rien du fournisseur (le backend porte la connexion)', () => {
    process.env = {
      ...env,
      AUTH_MODE: 'oidc',
      OIDC_ISSUER: 'http://localhost:18080/realms/quiz-dock',
      OIDC_CLIENT_ID: 'quiz-dock-frontend',
    };
    expect(controller.config()).toEqual({
      mode: 'oidc',
      communityStore: false,
      demo: null,
      standalone: false,
      anonymousParticipants: false,
    });
  });

  it('offers open access only under OIDC with ALLOW_ANONYMOUS_PARTICIPANTS=true', () => {
    process.env = { ...env, AUTH_MODE: 'oidc', ALLOW_ANONYMOUS_PARTICIPANTS: 'true' };
    expect(controller.config().anonymousParticipants).toBe(true);
    process.env = { ...env, AUTH_MODE: 'none', ALLOW_ANONYMOUS_PARTICIPANTS: 'true' };
    expect(controller.config().anonymousParticipants).toBe(false);
  });

  it('announces the shared demo account when DEMO_MODE=true', () => {
    process.env = { ...env, AUTH_MODE: 'none', DEMO_MODE: 'true' };
    expect(controller.config()).toEqual({
      mode: 'none',
      communityStore: false,
      demo: { user: 'demo_user' },
      standalone: false,
      anonymousParticipants: false,
    });
  });

  it('enables community access only when a registry is explicitly configured', () => {
    process.env = { ...env, QUIZ_STORE_URL: 'https://store.example/registry.json' };
    expect(controller.config().communityStore).toBe(true);
    delete process.env.QUIZ_STORE_URL;
    expect(controller.config().communityStore).toBe(false);
  });

  it('hides the community store when registries are explicitly empty', () => {
    process.env = { ...env, QUIZ_STORE_URL: '' };
    expect(controller.config().communityStore).toBe(false);
  });

  it('says it is the all-in-one image, which the demo page lists as a limitation', () => {
    process.env = { ...env, AUTH_MODE: 'none', QUIZDOCK_FLAVOR: 'standalone' };
    expect(controller.config()).toMatchObject({ standalone: true });
  });
});
