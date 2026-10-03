import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Register } from './pages/Register';

function Home() {
  return (
    <Layout>
      <div className="card">
        <h1>Mutual Render Attestation</h1>
        <p className="lede">
          Evidence of what a consent screen showed, committed by the server before you act and
          attested by your browser when you do.
        </p>
      </div>
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}
