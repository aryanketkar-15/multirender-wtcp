import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { useAuth } from '../lib/auth';
import { MESSAGES, validEmail } from '../lib/validation';
import type { Errors } from '../lib/validation';

export function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ text: string; verify?: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    const found: Errors = {};
    if (!validEmail(email)) found.email = MESSAGES.email;
    if (password === '') found.password = 'Enter your password';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const outcome = await login(email.trim(), password);
    setSubmitting(false);

    switch (outcome.kind) {
      case 'ok':
        navigate(from, { replace: true });
        return;
      case 'invalid':
        setBanner({ text: 'Email or password is incorrect.' });
        return;
      case 'unverified':
        setBanner({ text: 'Verify your email address before signing in.', verify: true });
        return;
      case 'throttled':
        setBanner({ text: 'Too many sign-in attempts. Please wait a little and try again.' });
        return;
      default:
        setBanner({ text: 'Something went wrong on our side. Please try again.' });
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      lede="Welcome back."
      asideTitle="Evidence you can check"
      asidePoints={[
        'Record your consent as signed evidence.',
        'Download an evidence pack for any record.',
        'Check a pack in the independent verifier.',
      ]}
    >
      {status === 'error' ? (
        <div className="banner warn" role="alert">
          We could not reach the server. Check your connection and reload the page.
        </div>
      ) : null}
      {banner ? (
        <div className="banner error" role="alert">
          {banner.text}{' '}
          {banner.verify ? (
            <Link to="/verify" state={{ email: email.trim() }}>
              Enter your code
            </Link>
          ) : null}
        </div>
      ) : null}
      <GoogleSignIn mode="signin" redirectTo={from} />
      <form onSubmit={onSubmit} noValidate>
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <button type="submit" className="btn block" disabled={submitting || status === 'loading'}>
          {submitting ? <span className="spinner" aria-hidden="true" /> : null}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="links">
        <Link to="/forgot-password">Forgot your password?</Link>
        <Link to="/register">Create an account</Link>
      </div>
    </AuthLayout>
  );
}
