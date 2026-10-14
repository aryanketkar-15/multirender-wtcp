import { checkRegionPolicy } from '../src/checks/regionPolicy';

/**
 * Found in milestone 6.3 by running the verifier on a real pack from the live server: the server's
 * schema (AttestationSchema, action_target) allows only [A-Za-z0-9_-], so the target is the bare
 * element id. The verifier had insisted on "#btn-agree" and rejected every honest pack.
 */
const bundle = {
  region_policy: 'consent/v1',
  critical_region: '#consent-region',
  markup:
    '<div id="consent-region"><p>We keep records for a year.</p>' +
    '<button type="button" id="btn-agree">Accept</button>' +
    '<button type="button" id="btn-reject">Reject</button></div>',
  css: '',
};

describe('region policy: action target format matches the server', () => {
  test('the bare element id the server issues is accepted', () => {
    expect(checkRegionPolicy(bundle, { action: 'accept', action_target: 'btn-agree' })).toEqual([]);
    expect(checkRegionPolicy(bundle, { action: 'reject', action_target: 'btn-reject' })).toEqual([]);
  });
  test('a mismatched target is still refused', () => {
    expect(checkRegionPolicy(bundle, { action: 'accept', action_target: 'btn-reject' })).toHaveLength(1);
    expect(checkRegionPolicy(bundle, { action: 'reject', action_target: '#btn-reject' })).toHaveLength(1);
  });
});
