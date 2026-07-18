import { render } from '@testing-library/react';
import RvChecklistWebUi from './ui';

describe('RvChecklistWebUi', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<RvChecklistWebUi />);
    expect(baseElement).toBeTruthy();
  });
});
