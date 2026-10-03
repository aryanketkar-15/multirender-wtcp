import { ATTESTOR_VERSION } from '../src/index';

describe('attestor', () => {
  it('exposes a version string', () => {
    expect(ATTESTOR_VERSION).toMatch(/^\d+\.\d+\.\d+(-\w+)?$/);
  });
});
