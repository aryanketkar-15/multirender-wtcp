import { BrowserRouter, Route, Routes } from 'react-router-dom';
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

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/verifier" element={<ErrorBoundary><Verify /></ErrorBoundary>} />
            <Route path="/verify-pack" element={<ErrorBoundary><Verify /></ErrorBoundary>} />
            <Route
              path="/consent"
              element={
                <RequireAuth>
                  <ErrorBoundary><Consent /></ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/packs"
              element={
                <RequireAuth>
                  <ErrorBoundary><MyPacks /></ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/admin/consent"
              element={
                <RequireAuth>
                  <ErrorBoundary><AdminConsent /></ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route path="/register" element={<ErrorBoundary><Register /></ErrorBoundary>} />
            <Route path="/verify" element={<ErrorBoundary><VerifyEmail /></ErrorBoundary>} />
            <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
            <Route path="/forgot-password" element={<ErrorBoundary><ForgotPassword /></ErrorBoundary>} />
            <Route path="/reset-password" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

