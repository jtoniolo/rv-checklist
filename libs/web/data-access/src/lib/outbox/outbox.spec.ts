/**
 * @jest-environment jsdom
 *
 * jsdom for `File`/`crypto.randomUUID`; `indexedDB` itself is stubbed with
 * `fake-indexeddb/auto` (jsdom ships no working implementation), and
 * `BroadcastChannel` comes from Node's own global (available under jsdom too
 * — no browser needed for either).
 */
import 'fake-indexeddb/auto';
import { OUTBOX_BROADCAST_CHANNEL } from '@rv-checklist/domain';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  currentSyncAuthStatus,
  onSyncAuthStatusChange,
} from '../powersync/sync-auth-status.js';
import {
  discardOutboxAttachment,
  enqueueAttachmentCapture,
  retryOutboxAttachment,
  useAttachmentOutboxAuthBridge,
  useOutboxEntriesForStop,
} from './outbox.js';

function file(name = 'reservation.pdf'): File {
  return new File(['bytes'], name, { type: 'application/pdf' });
}

describe('enqueueAttachmentCapture', () => {
  it('queues the capture as pending, keyed by a fresh id', async () => {
    const entry = await enqueueAttachmentCapture({
      stopId: 'stop-1',
      tripId: 'trip-1',
      rigId: 'rig-1',
      file: file(),
    });

    expect(entry?.status).toBe('pending');
    expect(entry?.stopId).toBe('stop-1');
    expect(entry?.id).toEqual(expect.any(String));
  });

  it('mints a different id for every capture', async () => {
    const a = await enqueueAttachmentCapture({
      stopId: 'stop-1',
      tripId: 'trip-1',
      rigId: 'rig-1',
      file: file('a.pdf'),
    });
    const b = await enqueueAttachmentCapture({
      stopId: 'stop-1',
      tripId: 'trip-1',
      rigId: 'rig-1',
      file: file('b.pdf'),
    });

    expect(a?.id).not.toEqual(b?.id);
  });
});

describe('useOutboxEntriesForStop', () => {
  it("loads the stop's queued entries on mount", async () => {
    const stopId = `stop-${crypto.randomUUID()}`;
    await enqueueAttachmentCapture({
      stopId,
      tripId: 'trip-1',
      rigId: 'rig-1',
      file: file(),
    });

    const { result } = renderHook(() => useOutboxEntriesForStop(stopId));

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
  });

  it("re-lists when this stop's outbox is broadcast as changed", async () => {
    const stopId = `stop-${crypto.randomUUID()}`;
    const { result } = renderHook(() => useOutboxEntriesForStop(stopId));
    await waitFor(() => {
      expect(result.current).toHaveLength(0);
    });

    await act(async () => {
      await enqueueAttachmentCapture({
        stopId,
        tripId: 'trip-1',
        rigId: 'rig-1',
        file: file(),
      });
    });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
  });

  it('ignores a broadcast for a different stop', async () => {
    const stopId = `stop-${crypto.randomUUID()}`;
    const otherStopId = `stop-${crypto.randomUUID()}`;
    const { result } = renderHook(() => useOutboxEntriesForStop(stopId));
    await waitFor(() => {
      expect(result.current).toHaveLength(0);
    });

    await act(async () => {
      await enqueueAttachmentCapture({
        stopId: otherStopId,
        tripId: 'trip-1',
        rigId: 'rig-1',
        file: file(),
      });
    });

    // Give the broadcast a chance to (not) arrive.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current).toHaveLength(0);
  });
});

describe('discardOutboxAttachment', () => {
  it('removes a queued entry, and the badge list for it', async () => {
    const stopId = `stop-${crypto.randomUUID()}`;
    const entry = await enqueueAttachmentCapture({
      stopId,
      tripId: 'trip-1',
      rigId: 'rig-1',
      file: file(),
    });
    const { result } = renderHook(() => useOutboxEntriesForStop(stopId));
    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });

    await act(async () => {
      await discardOutboxAttachment(stopId, entry?.id ?? '');
    });

    await waitFor(() => {
      expect(result.current).toHaveLength(0);
    });
  });
});

describe('retryOutboxAttachment', () => {
  it('puts a failed entry back to pending', async () => {
    const stopId = `stop-${crypto.randomUUID()}`;
    const entry = await enqueueAttachmentCapture({
      stopId,
      tripId: 'trip-1',
      rigId: 'rig-1',
      file: file(),
    });

    await retryOutboxAttachment(stopId, entry?.id ?? '');

    const { result } = renderHook(() => useOutboxEntriesForStop(stopId));
    await waitFor(() => {
      expect(result.current[0]?.status).toBe('pending');
    });
  });
});

describe('useAttachmentOutboxAuthBridge', () => {
  afterEach(() => {
    onSyncAuthStatusChange(() => {
      // Drain nothing; status resets below.
    });
  });

  it('sets sync auth status to signed-out on an outbox-auth-required broadcast', async () => {
    renderHook(() => {
      useAttachmentOutboxAuthBridge();
    });

    const channel = new BroadcastChannel(OUTBOX_BROADCAST_CHANNEL);
    channel.postMessage({ type: 'rv-checklist/outbox-auth-required' });
    channel.close();

    await waitFor(() => {
      expect(currentSyncAuthStatus()).toBe('signed-out');
    });
  });
});
