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
      interval: undefined,
      oneTime: false,
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
      interval: undefined,
      oneTime: false,
      fieldSchema: [],
    });
  });

  it('pre-fills the description when editing, and clearing it submits none', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Flush water heater',
      description: 'Sediment builds up.',
      interval: { basis: 'calendar', months: 6 },
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
      interval: { basis: 'calendar', months: 6 },
      oneTime: false,
      fieldSchema: [],
    });
  });

  it('submits a one-time task with no interval (issue #29)', () => {
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
      target: { value: 'Replenish first-aid kit' },
    });
    fireEvent.click(screen.getByLabelText('One-time task'));
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Replenish first-aid kit',
      description: undefined,
      interval: undefined,
      oneTime: true,
      fieldSchema: [],
    });
  });

  it('submits a calendar interval on the default basis', () => {
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
      target: { value: 'Flush water heater' },
    });
    fireEvent.change(screen.getByLabelText(/^Repeat every \(months\)/), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { basis: 'calendar', months: 6 },
      }),
    );
  });

  // The basis switch (issue #32): a distance task edits on the distance basis —
  // the km field shows (not the months one), and submitting emits the distance
  // interval, proving the form drives both bases.
  it('edits a distance task on the distance basis, emitting a km interval', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Repack wheel bearings',
      interval: { basis: 'distance', km: 20_000 },
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

    // The distance basis is in force: km shown, months hidden.
    const km = screen.getByLabelText(/^Repeat every \(km\)/);
    expect((km as HTMLInputElement).value).toBe('20000');
    expect(screen.queryByLabelText(/^Repeat every \(months\)/)).toBeNull();

    fireEvent.change(km, { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { basis: 'distance', km: 25_000 },
      }),
    );
  });

  it('pre-checks one-time and hides the interval when editing a one-time task', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Re-glue loose trim',
      oneTime: true,
      fieldSchema: [],
    };
    render(
      <TaskForm
        initial={task}
        submitLabel="Save changes"
        pending={false}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(
      screen.getByLabelText('One-time task').getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.queryByLabelText('Repeat every (months)')).toBeNull();
  });
});
