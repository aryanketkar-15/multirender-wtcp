import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo />
          <span>Mutual Render Attestation</span>
        </Link>
        <nav className="app-nav" aria-label="Primary">
          <Link to="/login">Sign in</Link>
          <Link to="/register">Register</Link>
        </nav>
      </header>
      <main className={wide ? 'page wide' : 'page'}>{children}</main>
    </>
  );
}
