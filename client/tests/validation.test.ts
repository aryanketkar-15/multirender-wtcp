import {
  MESSAGES,
  integerInRange,
  validEmail,
  validName,
  validOtp,
  validPassword,
  validateOtp,
  validatePasswordReset,
  validateRegistration,
  validateSettings,
} from '../src/lib/validation';

const good = {
  name: 'Asha Verma',
  email: 'asha@example.com',
  password: 'correct horse 9 battery',
  passwordConfirm: 'correct horse 9 battery',
  acceptTerms: true,
};

describe('client validation mirrors the server rules', () => {
  it('accepts a valid registration', () => {
    expect(validateRegistration(good)).toEqual({});
  });

  it.each([
    [1, false],
    [2, true],
    [80, true],
    [81, false],
  ])('name length %i -> %s', (n, ok) => {
    expect(validName('a'.repeat(n))).toBe(ok);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(validName('山'.repeat(80))).toBe(true);
    expect(validName('😀'.repeat(80))).toBe(true);
  });

  it.each(['notanemail', 'a@', '@b.com', 'a b@c.com', 'a@b'])('rejects email %s', (e) => {
    expect(validEmail(e)).toBe(false);
  });

  it.each([
    ['abcdefghij1', false], // 11
    ['abcdefghijk1', true], // 12
    ['a'.repeat(127) + '1', true], // 128
    ['a'.repeat(128) + '1', false], // 129
    ['abcdefghijklmnop', false], // no digit
    ['1234567890123456', false], // no letter
  ])('password %s -> %s', (p, ok) => {
    expect(validPassword(p)).toBe(ok);
  });

  it('flags a mismatching retype and a missing consent tick', () => {
    const errors = validateRegistration({ ...good, passwordConfirm: 'B', acceptTerms: false });
    expect(errors.password_confirm).toBe(MESSAGES.passwordConfirm);
    expect(errors.accept_terms).toBe(MESSAGES.acceptTerms);
  });

  it('reports every failing field at once', () => {
    const errors = validateRegistration({
      name: '',
      email: '',
      password: '',
      passwordConfirm: '',
      acceptTerms: false,
    });
    expect(Object.keys(errors).sort()).toEqual([
      'accept_terms',
      'email',
      'name',
      'password',
      'password_confirm',
    ]);
  });

  it.each([
    ['012345', true],
    ['12345', false],
    ['1234567', false],
    ['12345a', false],
  ])('otp %s -> %s', (code, ok) => {
    expect(validOtp(code)).toBe(ok);
    expect('code' in validateOtp('a@b.co', code)).toBe(!ok);
  });

  it.each([
    ['1', true],
    ['60', true],
    ['0', false],
    ['61', false],
    ['abc', false],
    ['1.5', false],
    ['', false],
  ])('validity window %s -> %s', (v, ok) => {
    expect(integerInRange(v, 1, 60)).toBe(ok);
    expect('validity_minutes' in validateSettings(v, '30')).toBe(!ok);
  });

  it('retention range is 1–3650 days', () => {
    expect(validateSettings('15', '3650')).toEqual({});
    expect(validateSettings('15', '3651').retention_days).toBe(MESSAGES.retention);
    expect(validateSettings('15', '0').retention_days).toBe(MESSAGES.retention);
  });

  it('password reset compares the pair', () => {
    expect(validatePasswordReset('a-long-enough-pass1', 'nope').password_confirm).toBe(
      MESSAGES.passwordConfirm,
    );
    expect(validatePasswordReset('a-long-enough-pass1', 'a-long-enough-pass1')).toEqual({});
  });
});
