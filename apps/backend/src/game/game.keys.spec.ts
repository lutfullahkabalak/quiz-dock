import { gameSetting } from './game.keys';

describe('gameSetting', () => {
  const env = process.env;
  afterEach(() => (process.env = env));

  it('reads a timing from the environment, 0 included, else its default', () => {
    process.env = { ...env, GAME_X: '250' };
    expect(gameSetting('GAME_X', 3000)).toBe(250);
    process.env = { ...env, GAME_X: '0' }; // e.g. never wait for media
    expect(gameSetting('GAME_X', 3000)).toBe(0);
    for (const raw of [undefined, '', '  ', 'soon']) {
      process.env = { ...env, GAME_X: raw };
      expect(gameSetting('GAME_X', 3000)).toBe(3000);
    }
  });
});
