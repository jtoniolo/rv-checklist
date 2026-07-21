import { fireEvent, render, screen } from '@testing-library/react';
import { RigForm } from './rig-form';

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
