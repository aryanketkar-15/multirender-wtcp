import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { RequireAuth } from '../src/components/RequireAuth';
import { Login } from '../src/pages/Login';
import * as apiModule from '../src/lib/api';

const alice = { id: 1, email: 'alice@example.com', name: 'Alice', verified: true };

function Probe() {
  const { status, user, login, logout } = useAuth();
  return (
    <div>
      <p>status:{status}</p>
      <p>user:{user ? user.email : 'none'}</p>
      <button onClick={() => void login('alice@example.com', 'pw')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('establishes a session on load and stores the CSRF token', async () => {
    const setToken = jest.spyOn(apiModule, 'setCsrfToken');
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({
      ok: true,
      status: 200,
      data: { authenticated: false, user: null, csrf_token: 'tok1' },
    });
    renderProbe();
    expect(screen.getByText('status:loading')).toBeInTheDocument();
    expect(await screen.findByText('status:ready')).toBeInTheDocument();
    expect(screen.getByText('user:none')).toBeInTheDocument();
    expect(setToken).toHaveBeenCalledWith('tok1');
  });

  it('surfaces an error state when the server is unreachable', async () => {
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: false, status: 0, data: {} });
    renderProbe();
    expect(await screen.findByText('status:error')).toBeInTheDocument();
  });

  it('logs in, replaces the CSRF token, and logs out into a fresh anonymous session', async () => {
    const get = jest.spyOn(apiModule.api, 'get').mockResolvedValue({
      ok: true,
      status: 200,
      data: { authenticated: false, user: null, csrf_token: 'anon' },
    });
    const post = jest.spyOn(apiModule.api, 'post');
    post.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { authenticated: true, user: alice, csrf_token: 'authed' },
    });
    const setToken = jest.spyOn(apiModule, 'setCsrfToken');
    const user = userEvent.setup();
    renderProbe();
    await screen.findByText('status:ready');
    await user.click(screen.getByText('login'));
    expect(await screen.findByText('user:alice@example.com')).toBeInTheDocument();
    expect(setToken).toHaveBeenLastCalledWith('authed');

    post.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    await user.click(screen.getByText('logout'));
    expect(await screen.findByText('user:none')).toBeInTheDocument();
    expect(post).toHaveBeenLastCalledWith('/api/logout');
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('RequireAuth', () => {
  afterEach(() => jest.restoreAllMocks());

  function renderGate(session: Record<string, unknown>) {
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({ ok: true, status: 200, data: session });
    render(
      <MemoryRouter initialEntries={['/secret']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/secret"
              element={
                <RequireAuth>
                  <p>secret content</p>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<p>login page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('shows a loading state, then redirects anonymous visitors to sign in', async () => {
    renderGate({ authenticated: false, user: null, csrf_token: 't' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('renders protected content for a signed-in user', async () => {
    renderGate({ authenticated: true, user: alice, csrf_token: 't' });
    expect(await screen.findByText('secret content')).toBeInTheDocument();
  });
});

describe('Login page', () => {
  afterEach(() => jest.restoreAllMocks());

  function renderLogin(post: jest.SpyInstance) {
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({
      ok: true,
      status: 200,
      data: { authenticated: false, user: null, csrf_token: 't' },
    });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<p>home page</p>} />
            <Route path="/verify" element={<p>verify page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    return { post, user: userEvent.setup() };
  }

  async function submit(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Sign in' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('validates before calling the server', async () => {
    const { post, user } = renderLogin(jest.spyOn(apiModule.api, 'post'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('goes home after a successful sign in', async () => {
    const post = jest.spyOn(apiModule.api, 'post').mockResolvedValue({
      ok: true,
      status: 200,
      data: { authenticated: true, user: alice, csrf_token: 'x' },
    });
    const { user } = renderLogin(post);
    await submit(user);
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('uses one generic message for bad credentials', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: false, status: 401, data: {} });
    const { user } = renderLogin(post);
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('points an unverified user to the verification page', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: false, status: 403, data: { error: 'email_not_verified' } });
    const { user } = renderLogin(post);
    await submit(user);
    await user.click(await screen.findByRole('link', { name: 'Enter your code' }));
    expect(screen.getByText('verify page')).toBeInTheDocument();
  });

  it('refreshes a stale CSRF token and retries once, instead of blaming verification', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    post.mockResolvedValueOnce({ ok: false, status: 403, data: { error: 'csrf_rejected' } });
    post.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { authenticated: true, user: alice, csrf_token: 'fresh' },
    });
    const { user } = renderLogin(post);
    await submit(user);
    expect(await screen.findByText('home page')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(apiModule.api.get).toHaveBeenCalledTimes(2); // load, then the refresh
  });

  it('does not call a plain 403 an unverified email', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: false, status: 403, data: {} });
    const { user } = renderLogin(post);
    await submit(user);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
  });

  it.each([
    [429, /too many sign-in attempts/i],
    [500, /something went wrong/i],
  ])('shows an error state for status %i', async (status, pattern) => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: false, status, data: {} });
    const { user } = renderLogin(post);
    await submit(user);
    expect(await screen.findByText(pattern)).toBeInTheDocument();
  });
});
