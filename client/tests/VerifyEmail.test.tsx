import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyEmail, formatCountdown } from '../src/pages/VerifyEmail';
import * as apiModule from '../src/lib/api';

function setup(email?: string) {
  jest.useFakeTimers();
  render(
    <MemoryRouter initialEntries={[{ pathname: '/verify', state: email ? { email } : null }]}>
      <Routes>
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

describe('VerifyEmail page', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('formats the countdown as m:ss', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('counts down code validity and resend cooldown', () => {
    setup('a@b.co');
    expect(screen.getByText('Code expires in 10:00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code in 60s' })).toBeDisabled();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Code expires in 9:00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });

  it('reports an expired code once the countdown ends', () => {
    setup('a@b.co');
    act(() => {
      jest.advanceTimersByTime(601_000);
    });
    expect(screen.getByText(/The code has expired/)).toBeInTheDocument();
  });

  it('rejects a malformed code without calling the server', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    const user = setup('a@b.co');
    await user.type(screen.getByLabelText('Verification code'), '123');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText('That code is incorrect or has expired')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('strips non-digits as the user types', async () => {
    const user = setup('a@b.co');
    await user.type(screen.getByLabelText('Verification code'), '12ab34');
    expect(screen.getByLabelText('Verification code')).toHaveValue('1234');
  });

  it('shows success and a way forward when the code is accepted', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: true, status: 200, data: {} });
    const user = setup('a@b.co');
    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText('Email verified')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Continue to sign in' }));
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('uses one generic message for any rejected code', async () => {
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: false, status: 422, data: {} });
    const user = setup('a@b.co');
    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is incorrect or has expired.',
    );
  });

  it('asks for the email when arriving without router state', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: true, status: 202, data: {} });
    const user = setup();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(post).toHaveBeenCalledWith('/api/otp/request', { email: 'a@b.co' });
    expect(await screen.findByText(/new code is on its way/)).toBeInTheDocument();
  });

  it('shows rate-limit and server-error states on resend', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    post.mockResolvedValueOnce({ ok: false, status: 429, data: {} });
    const user = setup('a@b.co');
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText(/Too many code requests/)).toBeInTheDocument();
    post.mockResolvedValueOnce({ ok: false, status: 500, data: {} });
    await user.click(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
