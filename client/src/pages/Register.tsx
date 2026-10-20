import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { AuthLayout } from '../components/AuthLayout';
import { api } from '../lib/api';
import { validateRegistration } from '../lib/validation';
import type { Errors } from '../lib/validation';

interface RegisterResponse {
  fields?: Errors;
}

export function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  // The consent box starts unticked and nothing ever ticks it for the user. The project forbids
  // in its own form the dark pattern its digest is built to detect in other people's.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    const found = validateRegistration({ name, email, password, passwordConfirm, acceptTerms });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const res = await api.post<RegisterResponse>('/api/register', {
      name,
      email,
      password,
      password_confirm: passwordConfirm,
      accept_terms: acceptTerms,
    });
    setSubmitting(false);

    if (res.status === 201) {
      // Send the verification code now; the verify page counts down from this request.
      await api.post('/api/otp/request', { email: email.trim() });
      // Router state, not the URL: an email address must not end up in history or logs.
      navigate('/verify', { state: { email: email.trim() } });
    } else if (res.status === 422 && res.data.fields) {
      setErrors(res.data.fields);
    } else if (res.status === 409) {
      setBanner('We could not create that account. If you already have one, sign in instead.');
    } else if (res.status === 429) {
      setBanner('Too many attempts. Please wait a while and try again.');
    } else {
      setBanner('Something went wrong on our side. Please try again.');
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      lede="Your consent records are tied to a verified email address."
      asideTitle="Why an account"
      asidePoints={[
        'A six-digit code confirms your email address.',
        'Your name and email are stored encrypted.',
        'Each consent you give becomes a signed record in a public log.',
      ]}
    >
      {banner ? (
        <div className="banner error" role="alert">
          {banner}
        </div>
      ) : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField
          label="Full name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="12–128 characters, with at least one letter and one digit."
        />
        <FormField
          label="Retype password"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          error={errors.password_confirm}
        />
        <div className="field">
          <div className="check">
            <input
              id="accept_terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              aria-invalid={errors.accept_terms ? 'true' : undefined}
              aria-describedby={errors.accept_terms ? 'accept_terms-error' : undefined}
            />
            <label htmlFor="accept_terms">
              I agree that my consent records are stored as encrypted evidence.
            </label>
          </div>
          {errors.accept_terms ? (
            <p id="accept_terms-error" role="alert" className="field-error">
              {errors.accept_terms}
            </p>
          ) : null}
        </div>
        <button type="submit" className="btn block" disabled={submitting}>
          {submitting ? <span className="spinner" aria-hidden="true" /> : null}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <div className="links">
        <span>
          Already registered? <Link to="/login">Sign in</Link>
        </span>
      </div>
    </AuthLayout>
  );
}
