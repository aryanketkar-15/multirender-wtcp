import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GoogleSignIn } from '../src/components/GoogleSignIn';
import * as apiModule from '../src/lib/api';
import { AuthProvider } from '../src/lib/auth';

type Callback = (response: { credential?: string }) => void;

function installGoogle() {
  let callback: Callback | null = null;
  const initialize = jest.fn((config: { callback: Callback }) => {
    callback = config.callback;
  });
  const renderButton = jest.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  return { initialize, renderButton, fire: (credential?: string) => callback?.({ credential }) };
}

function mockApi(clientId: string | null, google: { status: number; data: object }) {
  jest.spyOn(apiModule.api, 'get').mockImplementation(async (path: string) => {
    if (path === '/api/auth/config') {
      return { ok: true, status: 200, data: { google_client_id: clientId } as never };
    }
    return {
      ok: true,
      status: 200,
      data: { authenticated: false, user: null, csrf_token: 'csrf' } as never,
    };
  });
  return jest.spyOn(apiModule.api, 'post').mockResolvedValue({
    ok: google.status >= 200 && google.status < 300,
    status: google.status,
    data: google.data as never,
  });
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<GoogleSignIn mode="signin" redirectTo="/welcome" />} />
          <Route path="/welcome" element={<p>Welcome page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Sign in with Google', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete window.google;
    document.head.querySelectorAll('script[src*="accounts.google.com"]').forEach((s) => s.remove());
  });

  it('renders nothing and loads nothing from Google when the server has no client id', async () => {
    mockApi(null, { status: 404, data: {} });
    const { container } = setup();
    await waitFor(() => expect(apiModule.api.get).toHaveBeenCalledWith('/api/auth/config'));
    expect(container).toBeEmptyDOMElement();
    expect(document.head.querySelector('script[src*="accounts.google.com"]')).toBeNull();
  });

  it('initialises Google with the server-provided client id and draws the button', async () => {
    const google = installGoogle();
    mockApi('client-123.apps.googleusercontent.com', { status: 200, data: {} });
    setup();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    expect(google.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-123.apps.googleusercontent.com',
        auto_select: false,
      }),
    );
    expect(google.renderButton.mock.calls[0][1]).toMatchObject({ text: 'signin_with' });
  });

  it('adds Google’s script only when it is needed and not already present', async () => {
    mockApi('client-123.apps.googleusercontent.com', { status: 200, data: {} });
    setup();
    await waitFor(() =>
      expect(
        document.head.querySelector('script[src="https://accounts.google.com/gsi/client"]'),
      ).not.toBeNull(),
    );
  });

  it('posts the credential to the server and goes to the target page on success', async () => {
    const google = installGoogle();
    const post = mockApi('client-123.apps.googleusercontent.com', {
      status: 200,
      data: {
        authenticated: true,
        user: { id: 1, email: 'a@b.c', name: 'A', verified: true },
        csrf_token: 'new',
      },
    });
    setup();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    google.fire('the-id-token');
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/auth/google', { credential: 'the-id-token' }),
    );
    expect(await screen.findByText('Welcome page')).toBeInTheDocument();
  });

  it('shows an error, and stays put, when the server refuses the token', async () => {
    const google = installGoogle();
    mockApi('client-123.apps.googleusercontent.com', {
      status: 401,
      data: { error: 'invalid_google_token' },
    });
    setup();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    google.fire('bad-token');
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be verified/i);
    expect(screen.queryByText('Welcome page')).not.toBeInTheDocument();
  });

  it('reports a rate limit distinctly', async () => {
    const google = installGoogle();
    mockApi('client-123.apps.googleusercontent.com', { status: 429, data: {} });
    setup();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    google.fire('x');
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('handles Google returning no credential', async () => {
    const google = installGoogle();
    mockApi('client-123.apps.googleusercontent.com', { status: 200, data: {} });
    setup();
    await waitFor(() => expect(google.renderButton).toHaveBeenCalled());
    google.fire(undefined);
    expect(await screen.findByRole('alert')).toHaveTextContent(/did not return/i);
  });
});
