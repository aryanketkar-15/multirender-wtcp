import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../lib/auth';

export function Home() {
  const { user } = useAuth();

  return (
    <Layout wide>
      <div className="home-container">
        {/* Hero Section */}
        <section className="card home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero-eyebrow">
            <span className="hero-tag">PS-3</span>
            <span>Web Technologies Course Project · VIT Pune TY-A9</span>
          </div>

          <h1 id="home-hero-title" className="home-hero-title">
            Mutual Render Attestation
          </h1>

          <p className="home-hero-lede">
            Cryptographic, two-sided evidence of what a consent screen actually rendered.
            Committed by the server before you act, attested by your browser when you do,
            and sealed in an append-only transparency log.
          </p>

          <div className="home-hero-actions">
            {user ? (
              <>
                <Link to="/consent" className="btn primary" id="hero-consent-btn">
                  Open Consent Notice
                </Link>
                <Link to="/verifier" className="btn secondary" id="hero-verifier-btn">
                  Independent Verifier Dashboard
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
                  Try Interactive Consent Flow
                </Link>
                <Link to="/verifier" className="btn secondary" id="hero-verifier-btn">
                  Independent Verifier Dashboard
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

        {/* The 4-Stage Protocol Architecture */}
        <section className="home-section" aria-labelledby="architecture-title">
          <header className="home-section-header">
            <h2 id="architecture-title">How Mutual Attestation Works</h2>
            <p className="home-section-subtitle">
              Neither party can unilaterally fabricate or repudiate the consent record.
            </p>
          </header>

          <div className="flow-grid">
            <div className="flow-card">
              <div className="flow-step-num">01</div>
              <h3>Server Commitment</h3>
              <p>
                Before user interaction, the server seals an immutable HTML/CSS bundle and signs an
                <strong> Ed25519 commitment</strong> binding the bundle hash, policy rules, and a single-use nonce.
              </p>
              <div className="flow-card-tag">Pre-Interaction</div>
            </div>

            <div className="flow-card">
              <div className="flow-step-num">02</div>
              <h3>Browser Attestation</h3>
              <p>
                At the exact moment of interaction, an independently hosted Attestor module (SRI verified)
                computes a normalized <strong>semantic layout digest</strong> and signs it with a hardware/browser
                <strong> ECDSA P-256</strong> key pair.
              </p>
              <div className="flow-card-tag">Interaction Instant</div>
            </div>

            <div className="flow-card">
              <div className="flow-step-num">03</div>
              <h3>Append-Only Log</h3>
              <p>
                Both the server commitment and client attestation are recorded as sequential leaves in an
                <strong> RFC 6962 Merkle tree</strong> with Signed Tree Heads (STHs), preventing backdating or omission.
              </p>
              <div className="flow-card-tag">Transparency Log</div>
            </div>

            <div className="flow-card">
              <div className="flow-step-num">04</div>
              <h3>Independent Verifier</h3>
              <p>
                Any auditor downloads a self-contained <strong>evidence pack (.zip)</strong>. A headless Chromium
                runner re-renders the bundle across <strong>11 verification stages</strong>, flagging exact node diffs if altered.
              </p>
              <div className="flow-card-tag">Zero-Trust Audit</div>
            </div>
          </div>
        </section>

        {/* Why Screenshots & Logs Fail */}
        <section className="home-section" aria-labelledby="comparison-title">
          <header className="home-section-header">
            <h2 id="comparison-title">Why Prior Art Fails</h2>
            <p className="home-section-subtitle">
              Single-sided evidence is structurally vulnerable to unilateral fabrication.
            </p>
          </header>

          <div className="comparison-grid">
            <div className="comparison-card vulnerability">
              <div className="comparison-badge">Single-Sided (Client)</div>
              <h3>Screenshots &amp; Replay</h3>
              <p>
                Easily fabricated or edited in browser DevTools before screenshot capture. The server has no
                cryptographic guarantee of what code was executed.
              </p>
              <div className="comparison-status">Unreliable in court</div>
            </div>

            <div className="comparison-card vulnerability">
              <div className="comparison-badge">Single-Sided (Server)</div>
              <h3>Server Database Logs</h3>
              <p>
                The provider controls the database and merely logs <code>accepted = true</code>. The user cannot
                prove which deceptive disclosures, dark patterns, or hidden boxes were present.
              </p>
              <div className="comparison-status">Subject to vendor dispute</div>
            </div>

            <div className="comparison-card solution">
              <div className="comparison-badge solution-badge">Two-Sided (MRA)</div>
              <h3>Two-Sided Render Attestation</h3>
              <p>
                Bilateral mathematical binding: Server commits sealed code beforehand; client signs layout digest at click time;
                third-party verifier checks headless browser re-render equality.
              </p>
              <div className="comparison-status verified">Non-repudiable &amp; audited</div>
            </div>
          </div>
        </section>

        {/* Demonstration Centerpiece & Viva Scenarios */}
        <section className="card demo-scenarios-card" aria-labelledby="scenarios-title">
          <h2 id="scenarios-title">Demonstration Scenarios</h2>
          <p className="lede">
            Explore the live verification outcomes implemented and tested in the project:
          </p>

          <div className="scenarios-list">
            <div className="scenario-item">
              <div className="scenario-marker ok">✓</div>
              <div className="scenario-content">
                <strong>Honest Consent Flow (VERIFIED)</strong>
                <p>
                  User reads standard disclosure and consents. Verifier executes all 11 stages: unpack, signatures,
                  bundle integrity, Merkle proofs, and Chromium re-render. All 11 stages pass.
                </p>
              </div>
            </div>

            <div className="scenario-item">
              <div className="scenario-marker attack">!</div>
              <div className="scenario-content">
                <strong>Notice Alteration Attack (DIGEST_MISMATCH with Node Diff)</strong>
                <p>
                  A malicious script or provider modifies disclosure text after page load (e.g. promising no data sharing).
                  Verifier re-renders the committed bundle, detects the digest discrepancy, and pinpoints the exact DOM node and text diff.
                </p>
              </div>
            </div>

            <div className="scenario-item">
              <div className="scenario-marker tamper">✕</div>
              <div className="scenario-content">
                <strong>Pack Splicing / Tamper (CLIENT_SIGNATURE_INVALID)</strong>
                <p>
                  An adversary attempts to splice an attestation with a modified public key or forged signature.
                  Verifier Stage 3 catches the cryptographic signature invalidity immediately.
                </p>
              </div>
            </div>
          </div>

          <div className="scenarios-action">
            <Link to="/verifier" className="btn primary">
              Launch Independent Verifier Dashboard
            </Link>
          </div>
        </section>

        {/* Academic Footer */}
        <footer className="home-academic-footer">
          <p>
            <strong>Project PS-3: Mutual Render Attestation</strong> · Group TY-A9
          </p>
          <p>
            Department of Computer Engineering, Vishwakarma Institute of Technology, Pune
          </p>
          <p>
            Course: Web Technologies · Faculty Guide: Prof. Rahul Diwate
          </p>
        </footer>
      </div>
    </Layout>
  );
}
