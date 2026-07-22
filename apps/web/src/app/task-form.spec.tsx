import type { MaintenanceTask } from '@rv-checklist/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskForm } from './task-form';

describe('TaskForm', () => {
  it('submits a trimmed multi-line description', () => {
    const onSubmit = jest.fn();
    render(
      <TaskForm
        submitLabel="Add task"
        pending={false}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Condition slide seals' },
    });
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: '  Seals dry out.\nWipe down, then condition.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Condition slide seals',
      description: 'Seals dry out.\nWipe down, then condition.',
      intervalMonths: undefined,
      fieldSchema: [],
    });
  });

  it('submits no description when the field is blank — absent means absent', () => {
    const onSubmit = jest.fn();
    render(
      <TaskForm
        submitLabel="Add task"
        pending={false}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Grease hitch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Grease hitch',
      description: undefined,
      intervalMonths: undefined,
      fieldSchema: [],
    });
  });

  it('pre-fills the description when editing, and clearing it submits none', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Flush water heater',
      description: 'Sediment builds up.',
      interval: { months: 6 },
      fieldSchema: [],
    };
    const onSubmit = jest.fn();
    render(
      <TaskForm
        initial={task}
        submitLabel="Save changes"
        pending={false}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    const description = screen.getByLabelText(/^Description/);
    expect((description as HTMLTextAreaElement).value).toBe(
      'Sediment builds up.',
    );

    fireEvent.change(description, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Flush water heater',
      description: undefined,
      intervalMonths: 6,
      fieldSchema: [],
    });
  });
});
