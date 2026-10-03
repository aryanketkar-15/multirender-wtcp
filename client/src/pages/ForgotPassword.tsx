import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { MESSAGES, validEmail } from '../lib/validation';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    if (!validEmail(email)) {
      setError(MESSAGES.email);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    const res = await api.post('/api/password/forgot', { email: email.trim() });
    setSubmitting(false);
    if (res.status === 202) {
      setSent(true);
    } else if (res.status === 429) {
      setBanner('Too many requests. Please wait a while and try again.');
    } else {
      setBanner('Something went wrong on our side. Please try again.');
    }
  }

  if (sent) {
    return (
      <Layout>
        <div className="card">
          <h1>Check your email</h1>
          {/* Same wording for every address: the page never reveals whether an account exists. */}
          <div className="banner ok" role="status">
            If an account exists for that address, a reset link is on its way. It works once and
            expires in 15 minutes.
          </div>
          <Link to="/login">Back to sign in</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="card">
        <h1>Reset your password</h1>
        <p className="lede">Enter your email and we will send you a link to choose a new one.</p>
        {banner ? (
          <div className="banner error" role="alert">
            {banner}
          </div>
        ) : null}
        <form onSubmit={onSubmit} noValidate>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <button type="submit" className="btn block" disabled={submitting}>
            {submitting ? <span className="spinner" aria-hidden="true" /> : null}
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className="links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </Layout>
  );
}
