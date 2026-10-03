import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

describe('App', () => {
  it('renders the product heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /mutual render attestation/i })).toBeInTheDocument();
  });
});
