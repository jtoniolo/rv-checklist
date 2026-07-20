import { render, screen } from '@testing-library/react';
import { Page } from './page';

describe('Page', () => {
  it('renders its children inside a main landmark', () => {
    render(
      <Page>
        <p>content</p>
      </Page>,
    );
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });
});
