import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Layout } from './Layout';
import { useAuth } from '../lib/auth';

/** Gate for signed-in pages. Shows a loading state while the session is being established. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <Layout>
        <div className="empty" role="status">
          <span className="spinner" aria-hidden="true" /> Loading…
        </div>
      </Layout>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
