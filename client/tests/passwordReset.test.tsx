import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ForgotPassword } from '../src/pages/ForgotPassword';
import { ResetPassword } from '../src/pages/ResetPassword';
import * as apiModule from '../src/lib/api';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

describe('ForgotPassword page', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup() {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );
    return userEvent.setup();
  }

  it('validates the email before calling the server', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the same neutral confirmation whatever the server says about the address', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: true, status: 202, data: {} });
    const user = setup();
    await user.type(screen.getByLabelText('Email'), 'anyone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
  });

  it.each([
    [429, /too many requests/i],
    [500, /something went wrong/i],
  ])('shows an error state for status %i', async (status, pattern) => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: false, status, data: {} });
    const user = setup();
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(pattern)).toBeInTheDocument();
  });
});

describe('ResetPassword page', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/forgot-password" element={<p>forgot page</p>} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
    return userEvent.setup();
  }

  const token = 'a'.repeat(64);
  const strong = 'brand new password 42';

  async function fill(user: ReturnType<typeof userEvent.setup>, pw = strong, confirm = strong) {
    await user.type(screen.getByLabelText('New password'), pw);
    await user.type(screen.getByLabelText('Retype new password'), confirm);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
  }

  it('asks for the emailed link when no token is present', () => {
    setup('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent('Open the link from your email');
  });

  it('removes the token from the address bar after reading it', async () => {
    setup(`/reset-password?token=${token}`);
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/reset-password$/);
  });

  it('flags mismatched passwords locally', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    const user = setup(`/reset-password?token=${token}`);
    await fill(user, strong, 'something else 1');
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the captured token and shows success', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const user = setup(`/reset-password?token=${token}`);
    await fill(user);
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/api/password/reset', {
      token,
      password: strong,
      password_confirm: strong,
    });
  });

  it('explains an invalid or expired link and offers a new one', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: false, status: 422, data: {} });
    const user = setup(`/reset-password?token=${token}`);
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    await user.click(screen.getByRole('link', { name: 'Request a new link' }));
    expect(screen.getByText('forgot page')).toBeInTheDocument();
  });

  it('renders server field errors', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({
      ok: false,
      status: 422,
      data: {
        fields: { password: 'Password must be 12–128 characters with a letter and a digit' },
      },
    });
    const user = setup(`/reset-password?token=${token}`);
    await fill(user);
    expect(await screen.findByText(/must be 12–128 characters/)).toBeInTheDocument();
  });
});
