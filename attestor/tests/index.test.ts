import { ATTESTOR_VERSION } from '../src/index';

describe('attestor', () => {
  it('exposes a semver version', () => {
    expect(ATTESTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
