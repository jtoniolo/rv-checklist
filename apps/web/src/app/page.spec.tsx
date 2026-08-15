import { render, screen } from '@testing-library/react';
import Index from './page';
import { StoreProvider } from './store-provider';

describe('web root, signed out', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renders the loading placeholder when not authenticated', async () => {
    render(
      <StoreProvider>
        <Index />
      </StoreProvider>,
    );
    expect(await screen.findByLabelText('Loading')).toBeTruthy();
  });
});
