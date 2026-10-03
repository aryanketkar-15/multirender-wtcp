/**
 * Client-side mirror of the server's validation rules (design document, validation table).
 * This is a usability feature with no security weight: the server re-runs every rule and is the
 * enforcement boundary. Messages are identical to the server's so feedback never contradicts it.
 */
export type Errors = Record<string, string>;

export const MESSAGES = {
  name: 'Enter your name (2–80 characters)',
  email: 'Enter a valid email address',
  password: 'Password must be 12–128 characters with a letter and a digit',
  passwordConfirm: 'Passwords do not match',
  acceptTerms: 'You must accept the terms to register',
  otp: 'That code is incorrect or has expired',
  validity: 'Validity window must be between 1 and 60 minutes',
  retention: 'Retention must be between 1 and 3650 days',
} as const;

const chars = (value: string): number => [...value].length;

export function validName(value: string): boolean {
  const n = chars(value.trim());
  return n >= 2 && n <= 80;
}

export function validEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function validPassword(value: string): boolean {
  const n = chars(value);
  return n >= 12 && n <= 128 && /\p{L}/u.test(value) && /\d/.test(value);
}

export function validOtp(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function integerInRange(value: string | number, min: number, max: number): boolean {
  const text = String(value).trim();
  if (!/^-?\d{1,18}$/.test(text)) return false;
  const n = Number(text);
  return n >= min && n <= max;
}

export interface RegistrationValues {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  acceptTerms: boolean;
}

export function validateRegistration(v: RegistrationValues): Errors {
  const e: Errors = {};
  if (!validName(v.name)) e.name = MESSAGES.name;
  if (!validEmail(v.email)) e.email = MESSAGES.email;
  if (!validPassword(v.password)) e.password = MESSAGES.password;
  if (v.passwordConfirm !== v.password || v.passwordConfirm === '') {
    e.password_confirm = MESSAGES.passwordConfirm;
  }
  if (!v.acceptTerms) e.accept_terms = MESSAGES.acceptTerms;
  return e;
}

export function validateOtp(email: string, code: string): Errors {
  const e: Errors = {};
  if (!validEmail(email)) e.email = MESSAGES.email;
  if (!validOtp(code)) e.code = MESSAGES.otp;
  return e;
}

export function validatePasswordReset(password: string, confirm: string): Errors {
  const e: Errors = {};
  if (!validPassword(password)) e.password = MESSAGES.password;
  if (confirm !== password || confirm === '') e.password_confirm = MESSAGES.passwordConfirm;
  return e;
}

export function validateSettings(validityMinutes: string, retentionDays: string): Errors {
  const e: Errors = {};
  if (!integerInRange(validityMinutes, 1, 60)) e.validity_minutes = MESSAGES.validity;
  if (!integerInRange(retentionDays, 1, 3650)) e.retention_days = MESSAGES.retention;
  return e;
}
