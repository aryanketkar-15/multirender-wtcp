import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App';
import * as apiModule from '../src/lib/api';

describe('accessibility basics', () => {
  beforeEach(() => {
    jest
      .spyOn(apiModule.api, 'get')
      .mockResolvedValue({ ok: false, status: 401, data: {} as never });
  });
  afterEach(() => jest.restoreAllMocks());

  it('offers a skip link that targets the focusable main region', async () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    const skip = await screen.findByRole('link', { name: /skip to content/i });
    expect(skip).toHaveAttribute('href', '#main');
    const main = document.getElementById('main');
    expect(main).not.toBeNull();
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('sets the document title from the route', async () => {
    window.history.pushState({}, '', '/register');
    render(<App />);
    await waitFor(() => expect(document.title).toBe('Create your account · MRA'));
  });
});
