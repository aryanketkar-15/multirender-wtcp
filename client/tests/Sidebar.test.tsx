import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../src/components/Layout';
import * as authModule from '../src/lib/auth';

const signedOut = { status: 'ready' as const, user: null };
const member = {
  status: 'ready' as const,
  user: { id: 1, email: 'asha@example.com', name: 'Asha Verma', verified: true },
};
const admin = { status: 'ready' as const, user: { ...member.user, admin: true } };

function setup(auth: object, path = '/') {
  jest.spyOn(authModule, 'useAuth').mockReturnValue({
    ...auth,
    login: jest.fn(),
    loginWithGoogle: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
  } as never);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <p>Page content</p>
      </Layout>
    </MemoryRouter>,
  );
}

const shell = () => document.querySelector('.app-shell') as HTMLElement;

describe('sidebar navigation', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it('offers the public destinations to a signed-out visitor', () => {
    setup(signedOut);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Verifier', 'Sign in', 'Register']);
  });

  it('offers the account destinations to a member, and the admin page only to an admin', () => {
    const { unmount } = setup(member);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Home', 'Consent', 'Evidence packs', 'Verifier']);
    expect(screen.getByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    unmount();

    setup(admin);
    expect(screen.getByRole('link', { name: 'Edit consent text' })).toBeInTheDocument();
  });

  it('marks the current page for assistive technology', () => {
    setup(member, '/packs');
    expect(screen.getByRole('link', { name: 'Evidence packs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('collapses to icons, keeps every name available, and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = setup(member);
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(shell()).not.toHaveClass('is-collapsed');

    await user.click(toggle);
    expect(shell()).toHaveClass('is-collapsed');
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // Links keep their accessible names, and sighted users get a tooltip in place of the text.
    expect(screen.getByRole('link', { name: 'Consent' })).toHaveAttribute('title', 'Consent');
    expect(window.localStorage.getItem('mra.sidebar')).toBe('collapsed');
    unmount();

    setup(member);
    expect(shell()).toHaveClass('is-collapsed');
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(shell()).not.toHaveClass('is-collapsed');
    expect(window.localStorage.getItem('mra.sidebar')).toBe('expanded');
  });

  it('still works when browser storage is blocked', async () => {
    const user = userEvent.setup();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setup(member);
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(shell()).toHaveClass('is-collapsed');
  });

  it('opens as a drawer from the menu button and closes with Escape or the close button', async () => {
    const user = userEvent.setup();
    setup(member);
    const open = screen.getByRole('button', { name: 'Open navigation' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await user.click(open);
    expect(shell()).toHaveClass('drawer-open');
    expect(open).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(shell()).not.toHaveClass('drawer-open');

    await user.click(open);
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(shell()).not.toHaveClass('drawer-open');
  });

  it('closes the drawer after the user follows a link', async () => {
    const user = userEvent.setup();
    setup(member);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('link', { name: 'Consent' }));
    expect(shell()).not.toHaveClass('drawer-open');
  });

  it('keeps the skip link first and the main region as its target', () => {
    setup(member);
    expect(screen.getAllByRole('link')[0]).toHaveTextContent('Skip to content');
    expect(document.getElementById('main')).toContainElement(screen.getByText('Page content'));
  });
});
