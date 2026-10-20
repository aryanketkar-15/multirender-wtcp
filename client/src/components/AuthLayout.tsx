import type { ReactNode } from 'react';
import { Layout } from './Layout';

interface Props {
  title: string;
  lede: string;
  /** Short statement and plain facts shown on the coloured side panel. */
  asideTitle: string;
  asidePoints: string[];
  children: ReactNode;
}

/** Sign-in and sign-up: a colour panel that says what the account is for, beside the form. */
export function AuthLayout({ title, lede, asideTitle, asidePoints, children }: Props) {
  return (
    <Layout wide>
      <div className="auth-split">
        <aside className="auth-aside" aria-label="About this account">
          <h2>{asideTitle}</h2>
          <ul>
            {asidePoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </aside>
        <section className="auth-panel">
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
          {children}
        </section>
      </div>
    </Layout>
  );
}
