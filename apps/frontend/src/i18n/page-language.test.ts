import { describe, expect, it } from 'vitest';
import './index';

describe('the page language', () => {
  it("is the instance's, not the one index.html carries", () => {
    // Tests pin the instance to French (resolveLang).
    expect(document.documentElement.lang).toBe('fr');
  });
});
