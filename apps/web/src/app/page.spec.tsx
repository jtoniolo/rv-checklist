import { render, screen } from '@testing-library/react';
import Index from './page';

describe('web shell', () => {
  it('renders the mobile-first shell', () => {
    render(<Index />);
    expect(screen.getByRole('heading', { name: /rv checklist/i })).toBeTruthy();
  });
});
