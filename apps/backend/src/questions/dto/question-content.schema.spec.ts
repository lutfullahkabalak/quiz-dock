import { normalizeAnswer } from './question-content.schema';

describe('normalizeAnswer (RG-06)', () => {
  it('minuscule, sans accent, espaces compactés', () => {
    expect(normalizeAnswer('  Élÿsée   Palais ')).toBe('elysee palais');
  });
});
