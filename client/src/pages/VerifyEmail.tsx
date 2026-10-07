import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { validateOtp } from '../lib/validation';
import type { Errors } from '../lib/validation';

const CODE_LIFETIME = 600; // seconds, matches the server's 10-minute expiry
const RESEND_COOLDOWN = 60;

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VerifyEmail() {
  const location = useLocation();
  const { refresh } = useAuth();
  const stateEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(stateEmail);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [codeLeft, setCodeLeft] = useState(stateEmail ? CODE_LIFETIME : 0);
  const [cooldown, setCooldown] = useState(stateEmail ? RESEND_COOLDOWN : 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCodeLeft((n) => Math.max(0, n - 1));
      setCooldown((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function sendCode() {
    setBanner(null);
    const found = validateOtp(email, '000000');
    if (found.email) {
      setErrors({ email: found.email });
      return;
    }
    setErrors({});
    setResending(true);
    const res = await api.post('/api/otp/request', { email });
    setResending(false);
    if (res.status === 202) {
      setCodeLeft(CODE_LIFETIME);
      setCooldown(RESEND_COOLDOWN);
      setBanner({ kind: 'ok', text: 'If that address has an account, a new code is on its way.' });
    } else if (res.status === 429) {
      setBanner({ kind: 'error', text: 'Too many code requests. Please try again later.' });
    } else {
      setBanner({ kind: 'error', text: 'Something went wrong on our side. Please try again.' });
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    const found = validateOtp(email, code);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setVerifying(true);
    const res = await api.post('/api/otp/verify', { email, code });
    setVerifying(false);
    if (res.ok) {
      await refresh(); // verification replaces the session, so pick up the new CSRF token
      setVerified(true);
    } else if (res.status === 422) {
      // One message for wrong, expired and locked codes: the server never says which.
      setBanner({ kind: 'error', text: 'That code is incorrect or has expired.' });
    } else {
      setBanner({ kind: 'error', text: 'Something went wrong on our side. Please try again.' });
    }
  }

  if (verified) {
    return (
      <Layout>
        <div className="card">
          <h1>Email verified</h1>
          <div className="banner ok" role="status">
            Your account is ready. You can now sign in.
          </div>
          <Link className="btn block" to="/login">
            Continue to sign in
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="card">
        <h1>Check your email</h1>
        <p className="lede">Enter the six-digit code we sent to verify your address.</p>
        {banner ? (
          <div
            className={`banner ${banner.kind}`}
            role={banner.kind === 'error' ? 'alert' : 'status'}
          >
            {banner.text}
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          {stateEmail ? null : (
            <FormField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />
          )}
          <FormField
            label="Verification code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={errors.code}
            hint={
              codeLeft > 0
                ? `Code expires in ${formatCountdown(codeLeft)}.`
                : 'The code has expired. Request a new one below.'
            }
          />
          <button type="submit" className="btn block" disabled={verifying}>
            {verifying ? <span className="spinner" aria-hidden="true" /> : null}
            {verifying ? 'Verifying…' : 'Verify email'}
          </button>
        </form>
        <div className="links">
          <button
            type="button"
            className="btn secondary"
            onClick={sendCode}
            disabled={resending || cooldown > 0}
          >
            {cooldown > 0
              ? `Resend code in ${cooldown}s`
              : resending
                ? 'Sending…'
                : 'Send a new code'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
