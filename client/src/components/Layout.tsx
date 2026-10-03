import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo />
          <span>Mutual Render Attestation</span>
        </Link>
        <nav className="app-nav" aria-label="Primary">
          {user ? (
            <>
              <span aria-label="Signed in as">{user.name}</span>
              <button type="button" className="btn secondary" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>
      <main className={wide ? 'page wide' : 'page'}>{children}</main>
    </>
  );
}
