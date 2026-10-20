import { render, screen } from '@testing-library/react';
import { RecordsNotice } from '../src/components/RecordsNotice';

it('tells visitors their consent choices are kept as signed evidence', () => {
  render(<RecordsNotice />);
  expect(screen.getByLabelText('About the records this app keeps')).toHaveTextContent(
    /records are real/i,
  );
  expect(screen.getByText(/append-only log/)).toBeInTheDocument();
});
