import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './lib/auth';
import { AdminConsent } from './pages/AdminConsent';
import { Consent } from './pages/Consent';
import { ForgotPassword } from './pages/ForgotPassword';
import { Login } from './pages/Login';
import { MyPacks } from './pages/MyPacks';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
import { Verify } from './pages/Verify';
import { VerifyEmail } from './pages/VerifyEmail';

import { Home } from './pages/Home';

const TITLES: Record<string, string> = {
  '/': 'Mutual Render Attestation',
  '/consent': 'Consent',
  '/packs': 'My evidence packs',
  '/verifier': 'Independent verifier',
  '/verify-pack': 'Independent verifier',
  '/admin/consent': 'Edit consent text',
  '/register': 'Create your account',
  '/verify': 'Verify your email',
  '/login': 'Sign in',
  '/forgot-password': 'Reset your password',
  '/reset-password': 'Choose a new password',
};

/** Keeps the browser tab title in step with the page, so screen-reader users hear where they are. */
function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = TITLES[pathname];
    document.title = page && pathname !== '/' ? `${page} · MRA` : 'MRA · Mutual Render Attestation';
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <RouteTitle />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/verifier"
              element={
                <ErrorBoundary>
                  <Verify />
                </ErrorBoundary>
              }
            />
            <Route
              path="/verify-pack"
              element={
                <ErrorBoundary>
                  <Verify />
                </ErrorBoundary>
              }
            />
            <Route
              path="/consent"
              element={
                <RequireAuth>
                  <ErrorBoundary>
                    <Consent />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/packs"
              element={
                <RequireAuth>
                  <ErrorBoundary>
                    <MyPacks />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/admin/consent"
              element={
                <RequireAuth>
                  <ErrorBoundary>
                    <AdminConsent />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/register"
              element={
                <ErrorBoundary>
                  <Register />
                </ErrorBoundary>
              }
            />
            <Route
              path="/verify"
              element={
                <ErrorBoundary>
                  <VerifyEmail />
                </ErrorBoundary>
              }
            />
            <Route
              path="/login"
              element={
                <ErrorBoundary>
                  <Login />
                </ErrorBoundary>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <ErrorBoundary>
                  <ForgotPassword />
                </ErrorBoundary>
              }
            />
            <Route
              path="/reset-password"
              element={
                <ErrorBoundary>
                  <ResetPassword />
                </ErrorBoundary>
              }
            />
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
