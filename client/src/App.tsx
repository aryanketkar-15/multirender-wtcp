import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider, useAuth } from './lib/auth';
import { AdminConsent } from './pages/AdminConsent';
import { Consent } from './pages/Consent';
import { ForgotPassword } from './pages/ForgotPassword';
import { Login } from './pages/Login';
import { MyPacks } from './pages/MyPacks';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
import { Verify } from './pages/Verify';
import { VerifyEmail } from './pages/VerifyEmail';

function Home() {
  const { user } = useAuth();
  return (
    <Layout>
      <div className="card">
        <h1>Mutual Render Attestation</h1>
        <p className="lede">
          Evidence of what a consent screen showed, committed by the server before you act and
          attested by your browser when you do.
        </p>
        <p>
          <Link to="/verifier">Open the Independent Verifier Dashboard</Link>
        </p>
        {user ? (
          <p>
            Signed in as {user.email}. <Link to="/consent">Open the consent page</Link>
            {' · '}
            <Link to="/packs">My evidence packs</Link>
            {user.admin ? (
              <>
                {' · '}
                <Link to="/admin/consent">Edit consent text</Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/verifier" element={<Verify />} />
          <Route path="/verify-pack" element={<Verify />} />
          <Route
            path="/consent"
            element={
              <RequireAuth>
                <Consent />
              </RequireAuth>
            }
          />
          <Route
            path="/packs"
            element={
              <RequireAuth>
                <MyPacks />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/consent"
            element={
              <RequireAuth>
                <AdminConsent />
              </RequireAuth>
            }
          />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
