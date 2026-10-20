import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';
import { NavIcon } from './NavIcon';
import type { NavIconName } from './NavIcon';

const STORAGE_KEY = 'mra.sidebar';

/** Remembered across visits. Storage can be blocked (private windows), so every access is guarded. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* the preference simply is not remembered */
  }
}

interface Item {
  to: string;
  label: string;
  icon: NavIconName;
  end?: boolean;
}

function SideLink({ item, collapsed }: { item: Item; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => (isActive ? 'side-link active' : 'side-link')}
      // The label stays in the DOM when collapsed (it is what screen readers announce); the title
      // is the tooltip sighted users get in place of the hidden text.
      title={collapsed ? item.label : undefined}
    >
      <NavIcon name={item.icon} />
      <span className="side-label">{item.label}</span>
    </NavLink>
  );
}

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A drawer left open would cover the page after navigating.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const toggleCollapsed = () => {
    setCollapsed((was) => {
      saveCollapsed(!was);
      return !was;
    });
  };

  const items: Item[] = user
    ? [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/consent', label: 'Consent', icon: 'consent' },
        { to: '/demo', label: 'Live demo', icon: 'demo' },
        { to: '/packs', label: 'Evidence packs', icon: 'packs' },
        { to: '/verifier', label: 'Verifier', icon: 'verifier' },
        ...(user.admin
          ? [{ to: '/admin/consent', label: 'Edit consent text', icon: 'admin' as const }]
          : []),
      ]
    : [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/verifier', label: 'Verifier', icon: 'verifier' },
        { to: '/login', label: 'Sign in', icon: 'sign-in' },
        { to: '/register', label: 'Register', icon: 'register' },
      ];

  const shellClass = ['app-shell', collapsed ? 'is-collapsed' : '', drawerOpen ? 'drawer-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="mobile-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="sidebar"
          onClick={() => setDrawerOpen(true)}
        >
          <NavIcon name="menu" />
        </button>
        <Link to="/" className="sidebar-brand">
          <Logo size={24} />
          <span>Mutual Render Attestation</span>
        </Link>
      </div>

      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <aside id="sidebar" className="sidebar" aria-label="Sidebar">
        <div className="sidebar-top">
          <Link
            to="/"
            className="sidebar-brand"
            title={collapsed ? 'Mutual Render Attestation' : undefined}
          >
            <Logo size={28} />
            <span className="side-label">Mutual Render Attestation</span>
          </Link>
          <button
            type="button"
            className="icon-btn drawer-close"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          >
            <NavIcon name="close" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {items.map((item) => (
            <SideLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="sidebar-foot">
          {user ? (
            <div className="side-user">
              <span className="side-avatar" aria-hidden="true">
                {user.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="side-label side-user-text">
                <span className="side-user-name">{user.name}</span>
                <span className="side-user-email">{user.email}</span>
              </span>
            </div>
          ) : null}
          {user ? (
            <button
              type="button"
              className="side-link side-button"
              onClick={() => void logout()}
              title={collapsed ? 'Sign out' : undefined}
            >
              <NavIcon name="sign-out" />
              <span className="side-label">Sign out</span>
            </button>
          ) : null}
          <button
            type="button"
            className="side-link side-button collapse-toggle"
            aria-expanded={!collapsed}
            aria-controls="sidebar"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : undefined}
          >
            <NavIcon name={collapsed ? 'expand' : 'collapse'} />
            <span className="side-label">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <main id="main" tabIndex={-1} className={wide ? 'page wide' : 'page'}>
          {children}
        </main>
      </div>
    </div>
  );
}
