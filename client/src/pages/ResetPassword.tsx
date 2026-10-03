import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { validatePasswordReset } from '../lib/validation';
import type { Errors } from '../lib/validation';

interface ResetResponse {
  fields?: Errors;
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Capture the token once, then remove it from the address bar so it does not linger in history
  // or leak through a Referer header.
  const [token] = useState(() => params.get('token') ?? '');
  useEffect(() => {
    if (params.has('token')) navigate('/reset-password', { replace: true });
  }, [params, navigate]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    const found = validatePasswordReset(password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const res = await api.post<ResetResponse>('/api/password/reset', {
      token,
      password,
      password_confirm: confirm,
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else if (res.status === 422 && res.data.fields) {
      setErrors(res.data.fields);
    } else if (res.status === 422) {
      setBanner('This reset link is invalid or has expired. Request a new one.');
    } else {
      setBanner('Something went wrong on our side. Please try again.');
    }
  }

  if (done) {
    return (
      <Layout>
        <div className="card">
          <h1>Password changed</h1>
          <div className="banner ok" role="status">
            Your password was updated and every other session was signed out.
          </div>
          <Link className="btn block" to="/login">
            Sign in
          </Link>
        </div>
      </Layout>
    );
  }

  if (token === '') {
    return (
      <Layout>
        <div className="card">
          <h1>Reset link needed</h1>
          <div className="banner warn" role="alert">
            Open the link from your email, or request a new one.
          </div>
          <Link to="/forgot-password">Request a reset link</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="card">
        <h1>Choose a new password</h1>
        {banner ? (
          <div className="banner error" role="alert">
            {banner} <Link to="/forgot-password">Request a new link</Link>
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          <FormField
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint="12–128 characters, with at least one letter and one digit."
          />
          <FormField
            label="Retype new password"
            name="password_confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.password_confirm}
          />
          <button type="submit" className="btn block" disabled={submitting}>
            {submitting ? <span className="spinner" aria-hidden="true" /> : null}
            {submitting ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
