import { fireEvent, render, screen } from '@testing-library/react';
import { RigForm } from './rig-form';

/** Cut or restore the network the way a browser reports it. */
function setNetwork(isOnline: boolean): void {
  (navigator as unknown as { onLine: boolean }).onLine = isOnline;
  fireEvent(globalThis, new Event(isOnline ? 'online' : 'offline'));
}

describe('RigForm', () => {
  it('submits trimmed values through the shadcn controls', () => {
    const onSubmit = jest.fn();
    render(
      <RigForm
        submitLabel="Add rig"
        pending={false}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nickname'), {
      target: { value: '  Silver Bullet  ' },
    });
    fireEvent.change(screen.getByLabelText('Year (optional)'), {
      target: { value: '2021' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add rig' }));

    expect(onSubmit).toHaveBeenCalledWith({
      nickname: 'Silver Bullet',
      year: 2021,
    });
  });

  it('converts metric dimension entries to integer millimetres', () => {
    const onSubmit = jest.fn();
    render(
      <RigForm
        submitLabel="Add rig"
        pending={false}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nickname'), {
      target: { value: 'Silver Bullet' },
    });
    fireEvent.change(screen.getByLabelText('Travel height (m)'), {
      target: { value: '4.11' },
    });
    fireEvent.change(screen.getByLabelText('Passenger side clearance (cm)'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add rig' }));

    expect(onSubmit).toHaveBeenCalledWith({
      nickname: 'Silver Bullet',
      travelHeightMm: 4110,
      clearancePassengerMm: 900,
    });
  });

  // Issue #153's second acceptance criterion. A manual Distance is an absolute
  // newest-wins write; arrivals are deltas that are exempt from it, so a
  // correction typed off grid can end a few km out once the queue drains.
  describe('the Distance field offline', () => {
    afterEach(() => {
      (navigator as unknown as { onLine: boolean }).onLine = true;
    });

    const warning = /arrivals recorded offline add to it/i;

    it('warns only while offline', () => {
      render(
        <RigForm
          submitLabel="Add rig"
          pending={false}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.queryByText(warning)).toBeNull();

      setNetwork(false);
      expect(screen.getByText(warning)).toBeTruthy();

      setNetwork(true);
      expect(screen.queryByText(warning)).toBeNull();
    });

    it('still submits a correction while offline', () => {
      const onSubmit = jest.fn();
      render(
        <RigForm
          submitLabel="Add rig"
          pending={false}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />,
      );

      setNetwork(false);
      fireEvent.change(screen.getByLabelText('Nickname'), {
        target: { value: 'Silver Bullet' },
      });
      // The label wraps a helper line as well as the input, so its accessible
      // name is more than the caption.
      fireEvent.change(screen.getByLabelText(/Current distance/), {
        target: { value: '38200' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add rig' }));

      expect(onSubmit).toHaveBeenCalledWith({
        nickname: 'Silver Bullet',
        distanceKm: 38_200,
      });
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('shows a validation error instead of submitting a blank nickname', () => {
    const onSubmit = jest.fn();
    render(
      <RigForm
        submitLabel="Add rig"
        pending={false}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add rig' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
