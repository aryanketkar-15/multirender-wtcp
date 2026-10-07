import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Register } from '../src/pages/Register';
import * as apiModule from '../src/lib/api';

function Verify() {
  const state = useLocation().state as { email?: string } | null;
  return <p>verify page for {state?.email}</p>;
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<Verify />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Asha Verma');
  await user.type(screen.getByLabelText('Email'), 'asha@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct horse 9 battery');
  await user.type(screen.getByLabelText('Retype password'), 'correct horse 9 battery');
  await user.click(screen.getByLabelText(/I agree/));
}

describe('Register page', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never pre-ticks the consent box', () => {
    setup();
    expect(screen.getByLabelText(/I agree/)).not.toBeChecked();
  });

  it('shows field errors and does not call the server when invalid', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your name (2–80 characters)')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('You must accept the terms to register')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('marks invalid fields for assistive technology', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits snake_case fields and moves to verification without the email in the URL', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: true, status: 201, data: {} });
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('verify page for asha@example.com')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/api/register', {
      name: 'Asha Verma',
      email: 'asha@example.com',
      password: 'correct horse 9 battery',
      password_confirm: 'correct horse 9 battery',
      accept_terms: true,
    });
  });

  it('requests the verification code as soon as the account is created', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: true, status: 201, data: {} });
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('verify page for asha@example.com');
    expect(post).toHaveBeenCalledWith('/api/otp/request', { email: 'asha@example.com' });
    const paths = post.mock.calls.map(([path]) => path);
    expect(paths.indexOf('/api/register')).toBeLessThan(paths.indexOf('/api/otp/request'));
  });

  it('renders field errors returned by the server', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({
      ok: false,
      status: 422,
      data: { fields: { email: 'Enter a valid email address' } },
    });
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows a generic message on conflict and never says the address exists', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: false, status: 409, data: {} });
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not create that account');
    expect(alert).not.toHaveTextContent(/already registered|exists/i);
  });

  it.each([
    [429, /too many attempts/i],
    [500, /something went wrong/i],
    [0, /something went wrong/i],
  ])('shows an error state for status %i', async (status, pattern) => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: false, status, data: {} });
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(pattern)).toBeInTheDocument();
  });

  it('shows a loading state and blocks double submission', async () => {
    let resolve: (v: apiModule.ApiResult) => void = () => {};
    const post = jest.spyOn(apiModule.api, 'post').mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = setup();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    const busy = await screen.findByRole('button', { name: /Creating account/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(post).toHaveBeenCalledTimes(1);
    resolve({ ok: false, status: 500, data: {} });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled(),
    );
  });
});
