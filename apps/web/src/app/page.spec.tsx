import { render, screen } from '@testing-library/react';
import Index from './page';
import { StoreProvider } from './store-provider';

describe('web shell', () => {
  it('renders the mobile-first shell', () => {
    render(
      <StoreProvider>
        <Index />
      </StoreProvider>,
    );
    expect(screen.getByRole('heading', { name: /rv checklist/i })).toBeTruthy();
  });
});
