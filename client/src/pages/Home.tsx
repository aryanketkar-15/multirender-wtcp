import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Mark } from '../components/Mark';
import { useAuth } from '../lib/auth';

const STEPS = [
  {
    title: 'The server commits to the notice',
    body: 'Before you act, the server seals the notice (HTML and CSS) into a bundle and signs a commitment to its hash with Ed25519, together with a single-use nonce.',
  },
  {
    title: 'Your browser attests what it shows',
    body: 'When you click, a separately hosted measuring script, checked by its hash before it runs, summarises what the page shows: text, controls, their states, sizes and contrast, and what covers what. Your browser signs that digest with a key it holds and cannot export.',
  },
  {
    title: 'Both records go into an append-only log',
    body: 'The commitment and your attestation are added to a Merkle log that follows RFC 6962. Signed tree heads make later insertion, removal or alteration detectable.',
  },
  {
    title: 'Anyone holding the pack can check it',
    body: 'You can export a self-contained evidence pack. A verifier that does not trust the server re-renders the committed notice and compares it with what your browser signed. If they differ, it names the element that changed.',
  },
];

const RECORDS = [
  {
    record: 'Screenshot or screen recording',
    control: 'The user’s browser',
    limit: 'Can be edited before it is captured. The server has no evidence of what it served.',
  },
  {
    record: 'Server database entry such as accepted = true',
    control: 'The service provider',
    limit:
      'The user cannot show what the notice looked like, and the provider can change its own records unnoticed.',
  },
  {
    record: 'MRA evidence pack',
    control: 'Server commitment and browser attestation, both in a public log',
    limit:
      'Shows whether the notice matches and where it differs. Covers the consent region only, can be sensitive to fonts and viewport, and does not say who caused a difference.',
  },
];

const SCENARIOS = [
  {
    kind: 'pass' as const,
    title: 'Honest consent: VERIFIED',
    body: 'The user reads the notice and accepts. All 11 verifier stages pass, including a re-render of the committed notice that matches what the browser signed.',
  },
  {
    kind: 'fail' as const,
    title: 'Notice rewritten after load: DIGEST_MISMATCH',
    body: 'A script changes the disclosure text after the page loads, for example to promise that no data is shared. The verifier re-renders the committed notice and names the paragraph that differs, with both texts.',
  },
  {
    kind: 'fail' as const,
    title: 'Attestation edited after signing: CLIENT_SIGNATURE_INVALID',
    body: 'A pack whose attestation was altered after the browser signed it fails at stage 3, before any re-render.',
  },
];

export function Home() {
  const { user } = useAuth();

  return (
    <Layout wide>
      <div className="home-container">
        <section className="home-hero" aria-labelledby="home-hero-title">
          <h1 id="home-hero-title" className="home-hero-title">
            Mutual Render Attestation
          </h1>

          <p className="home-hero-lede">
            Evidence, from both sides, of what a consent screen showed. The server commits to the
            notice before you act, your browser attests to what it displayed when you did, and both
            records are added to an append-only log that anyone can check.
          </p>

          <div className="home-hero-actions">
            {user ? (
              <>
                <Link to="/consent" className="btn primary" id="hero-consent-btn">
                  Open Consent Notice
                </Link>
                <Link to="/verifier" className="btn secondary" id="hero-verifier-btn">
                  Independent Verifier
                </Link>
                <Link to="/packs" className="btn secondary" id="hero-packs-btn">
                  My Evidence Packs
                </Link>
                {user.admin && (
                  <Link to="/admin/consent" className="btn secondary" id="hero-admin-btn">
                    Edit Consent Notice (Admin)
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link to="/login" className="btn primary" id="hero-signin-btn">
                  Try the Consent Flow
                </Link>
                <Link to="/verifier" className="btn secondary" id="hero-verifier-btn">
                  Independent Verifier
                </Link>
                <Link to="/register" className="btn secondary" id="hero-register-btn">
                  Create Demo Account
                </Link>
              </>
            )}
          </div>

          {user && (
            <p className="home-signed-in-note">
              Signed in as <strong>{user.email}</strong> ({user.name}).
            </p>
          )}
        </section>

        <section className="home-section" aria-labelledby="architecture-title">
          <h2 id="architecture-title">How it works</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.title} className="step">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-section" aria-labelledby="records-title">
          <h2 id="records-title">How it compares with other records</h2>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Comparison of consent records, scrollable"
          >
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Who controls it</th>
                  <th scope="col">What it cannot show</th>
                </tr>
              </thead>
              <tbody>
                {RECORDS.map((r) => (
                  <tr key={r.record}>
                    <th scope="row">{r.record}</th>
                    <td>{r.control}</td>
                    <td>{r.limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="home-section" aria-labelledby="scenarios-title">
          <h2 id="scenarios-title">Three cases to try in the verifier</h2>
          <ul className="scenarios">
            {SCENARIOS.map((s) => (
              <li key={s.title} className="scenario">
                <Mark kind={s.kind} />
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p>
            <Link to="/verifier" className="btn primary">
              Open the verifier
            </Link>
          </p>
        </section>

        <footer className="home-academic-footer">
          <p>
            <strong>PS-3 Mutual Render Attestation</strong>, Group TY-A9. Department of Computer
            Engineering, Vishwakarma Institute of Technology, Pune. Course: Web Technologies.
            Faculty guide: Prof. Rahul Diwate.
          </p>
        </footer>
      </div>
    </Layout>
  );
}
