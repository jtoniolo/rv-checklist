import {
  currentSyncAuthStatus,
  onSyncAuthStatusChange,
  setSyncAuthStatus,
} from './sync-auth-status.js';

describe('sync auth status', () => {
  afterEach(() => {
    // Every other module reads this as a shared, page-wide singleton
    // (ADR-0028) — leave it the way the next test expects to find it.
    setSyncAuthStatus('ok');
  });

  it('starts ok, so the banner stays hidden until the connector says otherwise', () => {
    expect(currentSyncAuthStatus()).toBe('ok');
  });

  it('remembers the last status the connector reported', () => {
    setSyncAuthStatus('signed-out');

    expect(currentSyncAuthStatus()).toBe('signed-out');
  });

  it('notifies subscribers of a change', () => {
    const listener = jest.fn();
    onSyncAuthStatusChange(listener);

    setSyncAuthStatus('owner-mismatch');

    expect(listener).toHaveBeenCalledWith('owner-mismatch');
  });

  it('does not notify a listener that unsubscribed', () => {
    const listener = jest.fn();
    const unsubscribe = onSyncAuthStatusChange(listener);
    unsubscribe();

    setSyncAuthStatus('signed-out');

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify when the status has not actually changed', () => {
    setSyncAuthStatus('signed-out');
    const listener = jest.fn();
    onSyncAuthStatusChange(listener);

    setSyncAuthStatus('signed-out');

    expect(listener).not.toHaveBeenCalled();
  });
});
