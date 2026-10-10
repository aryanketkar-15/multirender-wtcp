import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyPacks } from '../src/pages/MyPacks';
import * as apiModule from '../src/lib/api';

describe('MyPacks page', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders loading skeleton while fetching', () => {
    jest.spyOn(apiModule.api, 'get').mockImplementation(() => new Promise(() => {}));
    render(
      <MemoryRouter>
        <MyPacks />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: /loading evidence packs/i })).toBeInTheDocument();
  });

  test('renders empty state when no packs exist (T7.2.1)', async () => {
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({
      ok: true,
      status: 200,
      data: { packs: [] },
    });

    render(
      <MemoryRouter>
        <MyPacks />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no evidence packs yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /open consent notice/i })).toBeInTheDocument();
  });

  test('renders list of packs with download links', async () => {
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        packs: [
          {
            id: 'pack-test-12345',
            owner_user_id: 1,
            attestation_id: 10,
            action: 'accept',
            attestation_hash: 'sha256:' + 'a'.repeat(64),
            commitment_hash: 'sha256:' + 'b'.repeat(64),
            created_at: '2026-10-10T12:00:00Z',
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <MyPacks />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('pack-test-12345')).toBeInTheDocument();
    });

    expect(screen.getByText('accept')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', {
      name: /download evidence pack pack-test-12345/i,
    });
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute('href', '/api/pack/pack-test-12345/download');
  });

  test('displays error banner on failure', async () => {
    jest.spyOn(apiModule.api, 'get').mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: 'server_error' },
    });

    render(
      <MemoryRouter>
        <MyPacks />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load evidence packs/i);
    });
  });
});
