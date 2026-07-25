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
      interval: { months: 6 },
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

  it('submits a calendar-only interval from the months field', () => {
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
        interval: { months: 6 },
      }),
    );
  });

  // Both cadence fields are independent (ADR-0016): a km-only task shows a filled
  // km field and a blank months field side by side, and editing km round-trips.
  it('edits a distance-only task from the km field, both fields shown', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Repack wheel bearings',
      interval: { km: 20_000 },
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

    // Both fields show; km is filled, months is blank (an absent limit).
    const km = screen.getByLabelText(/^Repeat every \(km\)/);
    const months = screen.getByLabelText(/^Repeat every \(months\)/);
    expect((km as HTMLInputElement).value).toBe('20000');
    expect((months as HTMLInputElement).value).toBe('');

    fireEvent.change(km, { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { km: 25_000 },
      }),
    );
  });

  // The combined interval (ADR-0016): "every N months or M km" round-trips as one
  // object carrying both limits.
  it('submits a combined interval from both cadence fields', () => {
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
      target: { value: 'Service trailer axle' },
    });
    fireEvent.change(screen.getByLabelText(/^Repeat every \(months\)/), {
      target: { value: '24' },
    });
    fireEvent.change(screen.getByLabelText(/^Repeat every \(km\)/), {
      target: { value: '30000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { months: 24, km: 30_000 },
      }),
    );
  });

  it('pre-fills both fields when editing a combined-interval task', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Service trailer axle',
      interval: { months: 24, km: 30_000 },
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

    const months = screen.getByLabelText(/^Repeat every \(months\)/);
    const km = screen.getByLabelText(/^Repeat every \(km\)/);
    expect((months as HTMLInputElement).value).toBe('24');
    expect((km as HTMLInputElement).value).toBe('30000');
    // A combined interval carries a calendar limit, so the anchor control shows.
    expect(screen.getByLabelText('Last performed')).not.toBeNull();
  });

  // The manual last-performed anchor (issue #33): a calendar-only date control.
  it('submits a manual last-performed anchor on a calendar task', () => {
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
      target: { value: 'Repack wheel bearings' },
    });
    fireEvent.change(screen.getByLabelText(/^Repeat every \(months\)/), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Last performed'), {
      target: { value: '2025-07-21' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { months: 12 },
        lastPerformed: '2025-07-21',
      }),
    );
  });

  it('hides the last-performed control when there is no calendar limit', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Repack wheel bearings',
      interval: { km: 20_000 },
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

    // Distance-only (months blank): no manual anchor — it anchors the calendar limit.
    expect(screen.queryByLabelText('Last performed')).toBeNull();
  });

  it('pre-fills the last-performed anchor when editing a calendar task', () => {
    const task: MaintenanceTask = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rigId: '550e8400-e29b-41d4-a716-446655440002',
      name: 'Flush water heater',
      interval: { months: 6 },
      lastPerformed: '2025-07-21',
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

    const lastPerformed = screen.getByLabelText('Last performed');
    expect((lastPerformed as HTMLInputElement).value).toBe('2025-07-21');
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
