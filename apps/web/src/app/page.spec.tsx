import { render, screen } from '@testing-library/react';
import Index from './page';
import { StoreProvider } from './store-provider';

describe('web shell, signed out', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renders the welcome and the sign-in surface', async () => {
    render(
      <StoreProvider>
        <Index />
      </StoreProvider>,
    );
    // After the hydration gate flips, the signed-out welcome shows.
    expect(
      await screen.findByRole('heading', { name: /rv checklist/i }),
    ).toBeTruthy();
    expect(screen.getByText(/sign in with google/i)).toBeTruthy();
  });
});
