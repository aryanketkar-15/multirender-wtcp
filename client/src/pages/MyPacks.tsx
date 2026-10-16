import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';


export interface EvidencePackItem {
  id: string;
  owner_user_id: number;
  attestation_id: number | null;
  action: string | null;
  attestation_hash: string | null;
  commitment_hash: string | null;
  created_at: string;
}

export function MyPacks() {
  const [packs, setPacks] = useState<EvidencePackItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await api.get<{ packs: EvidencePackItem[] }>('/api/pack');
      if (cancelled) return;
      if (res.ok && Array.isArray(res.data.packs)) {
        setPacks(res.data.packs);
      } else {
        setError('Could not load evidence packs. Please try again.');
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout wide>
      <div className="card">
        <h1>My Evidence Packs</h1>
        <p className="lede">
          Portable, self-contained evidence of your past consent choices. Each pack contains the
          sealed bundle, server commitment, your signed attestation, Merkle inclusion proofs, and
          the signed tree head.
        </p>

        {loading ? (
          <div aria-label="Loading evidence packs" role="status">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        ) : null}

        {error ? (
          <div className="banner error" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && !error && packs && packs.length === 0 ? (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="16" y2="17"/>
                <line x1="8" y1="9" x2="10" y2="9"/>
              </svg>
            }
            heading="No evidence packs yet"
            body="You have not recorded any consent decisions. Open the consent notice to create your first evidence pack."
            action={
              <Link to="/consent" className="btn secondary" id="empty-packs-consent-link">
                Open Consent Notice
              </Link>
            }
          />
        ) : null}


        {!loading && !error && packs && packs.length > 0 ? (
          <div className="pack-list" role="list">
            {packs.map((pack) => (
              <div key={pack.id} className="pack-card" role="listitem">
                <div className="pack-info">
                  <div className="pack-title">
                    <code>{pack.id}</code>
                    {pack.action ? (
                      <span className={`badge ${pack.action === 'accept' ? 'accept' : 'reject'}`}>
                        {pack.action}
                      </span>
                    ) : null}
                  </div>
                  {pack.attestation_hash ? (
                    <small>
                      Ref: <code>{pack.attestation_hash}</code>
                    </small>
                  ) : null}
                  <small style={{ color: 'var(--ink-soft)' }}>
                    Recorded on {new Date(pack.created_at).toLocaleString()}
                  </small>
                </div>
                <div>
                  <a
                    href={`/api/pack/${pack.id}/download`}
                    download={`evidence-pack-${pack.id}.zip`}
                    className="btn secondary"
                    aria-label={`Download evidence pack ${pack.id}`}
                  >
                    Download (.zip)
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
