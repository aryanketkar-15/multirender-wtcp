import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FormField } from '../components/FormField';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { validateSettings } from '../lib/validation';
import type { Errors } from '../lib/validation';

interface Settings {
  disclosure_text: string;
  accept_label: string;
  reject_label: string;
  validity_minutes: number;
  retention_days: number;
}

interface Payload {
  settings?: Settings;
  fields?: Errors;
}

export function AdminConsent() {
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [text, setText] = useState('');
  const [accept, setAccept] = useState('');
  const [reject, setReject] = useState('');
  const [validity, setValidity] = useState('');
  const [retention, setRetention] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.get<Payload>('/api/admin/consent').then((res) => {
      if (cancelled) return;
      if (res.status === 403 || res.status === 401) return setLoaded('forbidden');
      if (!res.ok || !res.data.settings) return setLoaded('error');
      const s = res.data.settings;
      setText(s.disclosure_text);
      setAccept(s.accept_label);
      setReject(s.reject_label);
      setValidity(String(s.validity_minutes));
      setRetention(String(s.retention_days));
      setLoaded('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    const found = validateSettings(validity, retention);
    if (text.trim() === '') found.disclosure_text = 'Enter the disclosure text (1–2000 characters)';
    if (accept.trim() === '') found.accept_label = 'Enter a label (1–40 characters)';
    if (reject.trim() === '') found.reject_label = 'Enter a label (1–40 characters)';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const res = await api.post<Payload>('/api/admin/consent', {
      disclosure_text: text,
      accept_label: accept,
      reject_label: reject,
      validity_minutes: Number(validity),
      retention_days: Number(retention),
    });
    setSaving(false);
    if (res.ok) {
      setBanner({ kind: 'ok', text: 'Saved. The next consent page will be a new sealed bundle.' });
    } else if (res.status === 422 && res.data.fields) {
      setErrors(res.data.fields);
    } else {
      setBanner({ kind: 'error', text: 'Could not save. Please try again.' });
    }
  }

  return (
    <Layout wide>
      <h1>Consent text</h1>
      {loaded === 'loading' ? (
        <div className="empty" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </div>
      ) : null}
      {loaded === 'forbidden' ? (
        <div className="banner error" role="alert">
          This page is for administrators.
        </div>
      ) : null}
      {loaded === 'error' ? (
        <div className="banner error" role="alert">
          Could not load the settings.
        </div>
      ) : null}
      {loaded === 'ready' ? (
        <form className="card" onSubmit={onSubmit} noValidate>
          {banner ? (
            <div
              className={`banner ${banner.kind}`}
              role={banner.kind === 'ok' ? 'status' : 'alert'}
            >
              {banner.text}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="disclosure_text">Disclosure text</label>
            <textarea
              id="disclosure_text"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={errors.disclosure_text ? 'true' : undefined}
              aria-describedby={errors.disclosure_text ? 'disclosure_text-error' : undefined}
            />
            {errors.disclosure_text ? (
              <p id="disclosure_text-error" role="alert" className="field-error">
                {errors.disclosure_text}
              </p>
            ) : null}
          </div>
          <FormField
            label="Accept button label"
            name="accept_label"
            type="text"
            value={accept}
            onChange={(e) => setAccept(e.target.value)}
            error={errors.accept_label}
          />
          <FormField
            label="Reject button label"
            name="reject_label"
            type="text"
            value={reject}
            onChange={(e) => setReject(e.target.value)}
            error={errors.reject_label}
          />
          <FormField
            label="Attestation validity (minutes)"
            name="validity_minutes"
            type="number"
            inputMode="numeric"
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
            error={errors.validity_minutes}
            hint="1–60 minutes."
          />
          <FormField
            label="Evidence retention (days)"
            name="retention_days"
            type="number"
            inputMode="numeric"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            error={errors.retention_days}
            hint="1–3650 days."
          />
          <button type="submit" className="btn" disabled={saving}>
            {saving ? <span className="spinner" aria-hidden="true" /> : null}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : null}
    </Layout>
  );
}
