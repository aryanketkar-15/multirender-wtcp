import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminConsent } from '../src/pages/AdminConsent';
import * as apiModule from '../src/lib/api';

const settings = {
  disclosure_text: 'Original notice.',
  accept_label: 'Accept',
  reject_label: 'Reject',
  validity_minutes: 15,
  retention_days: 365,
};

function setup(getResult: { ok: boolean; status: number; data: unknown }) {
  jest.spyOn(apiModule.api, 'get').mockResolvedValue(getResult as never);
  render(
    <MemoryRouter>
      <AdminConsent />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('AdminConsent page', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loads the current settings into the form', async () => {
    setup({ ok: true, status: 200, data: { settings } });
    expect(await screen.findByLabelText('Disclosure text')).toHaveValue('Original notice.');
    expect(screen.getByLabelText('Attestation validity (minutes)')).toHaveValue(15);
    expect(screen.getByLabelText('Evidence retention (days)')).toHaveValue(365);
  });

  it('tells non-administrators the page is not for them', async () => {
    setup({ ok: false, status: 403, data: {} });
    expect(await screen.findByRole('alert')).toHaveTextContent('administrators');
  });

  it('shows an error state when settings cannot be loaded', async () => {
    setup({ ok: false, status: 500, data: {} });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  });

  it('saves an edited disclosure and says a new sealed bundle will follow', async () => {
    const post = jest
      .spyOn(apiModule.api, 'post')
      .mockResolvedValue({ ok: true, status: 200, data: {} });
    const user = setup({ ok: true, status: 200, data: { settings } });
    const box = await screen.findByLabelText('Disclosure text');
    await user.clear(box);
    await user.type(box, 'We share data with advertisers.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('new sealed bundle');
    expect(post).toHaveBeenCalledWith('/api/admin/consent', {
      ...settings,
      disclosure_text: 'We share data with advertisers.',
    });
  });

  it.each([
    ['Attestation validity (minutes)', '0', 'Validity window must be between 1 and 60 minutes'],
    ['Attestation validity (minutes)', '61', 'Validity window must be between 1 and 60 minutes'],
    ['Evidence retention (days)', '0', 'Retention must be between 1 and 3650 days'],
    ['Evidence retention (days)', '3651', 'Retention must be between 1 and 3650 days'],
  ])('rejects %s = %s locally', async (label, value, message) => {
    const post = jest.spyOn(apiModule.api, 'post');
    const user = setup({ ok: true, status: 200, data: { settings } });
    const field = await screen.findByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects an empty disclosure', async () => {
    const user = setup({ ok: true, status: 200, data: { settings } });
    await user.clear(await screen.findByLabelText('Disclosure text'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Enter the disclosure text/)).toBeInTheDocument();
  });

  it('renders server-side field errors and failures', async () => {
    const post = jest.spyOn(apiModule.api, 'post');
    post.mockResolvedValueOnce({
      ok: false,
      status: 422,
      data: { fields: { retention_days: 'Retention must be between 1 and 3650 days' } },
    });
    const user = setup({ ok: true, status: 200, data: { settings } });
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Retention must be between 1 and 3650 days'),
    ).toBeInTheDocument();
    post.mockResolvedValueOnce({ ok: false, status: 500, data: {} });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  });
});
