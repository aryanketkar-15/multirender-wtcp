import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './lib/auth';
import { ForgotPassword } from './pages/ForgotPassword';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
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
        {user ? <p>Signed in as {user.email}.</p> : null}
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
