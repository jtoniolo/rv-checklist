import { render, screen } from '@testing-library/react';
import { AuthProvider } from './auth-provider';
import Index from './page';

describe('web shell', () => {
  it('renders the mobile-first shell', () => {
    render(
      <AuthProvider>
        <Index />
      </AuthProvider>,
    );
    expect(screen.getByRole('heading', { name: /rv checklist/i })).toBeTruthy();
  });
});
