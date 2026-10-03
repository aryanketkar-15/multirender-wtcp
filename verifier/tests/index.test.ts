import { VERIFIER_VERSION } from '../src/index';

describe('verifier', () => {
  it('exposes a semver version', () => {
    expect(VERIFIER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
