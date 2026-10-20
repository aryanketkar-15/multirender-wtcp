import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo />
          <span>Mutual Render Attestation</span>
        </Link>
        <nav className="app-nav" aria-label="Primary">
          {user ? (
            <>
              <Link to="/consent">Consent</Link>
              <Link to="/packs">Evidence Packs</Link>
              <Link to="/verifier">Verifier</Link>
              <span className="nav-user" aria-label="Signed in as">
                {user.name}
              </span>
              <button type="button" className="btn secondary btn-sm" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/verifier">Verifier</Link>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className={wide ? 'page wide' : 'page'}>
        {children}
      </main>
    </>
  );
}
