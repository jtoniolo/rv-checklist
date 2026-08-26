import { act, render } from '@testing-library/react';
import { useReconnectLegRefetch } from './reconnect-leg-refetch';

interface Item {
  readonly id: string;
  readonly placeId?: string;
}

function Harness({
  items,
  startPlaceId,
  fill,
  subscribe,
}: {
  readonly items: readonly Item[];
  readonly startPlaceId: string | undefined;
  readonly fill: (item: Item, fromPlaceId: string | undefined) => Promise<void>;
  readonly subscribe: (notify: () => void) => () => void;
}): undefined {
  useReconnectLegRefetch({ items, startPlaceId, fill, subscribe });
  return;
}

/** A fake reconnect signal the test controls directly. */
function fakeSubscribe(): {
  readonly subscribe: (notify: () => void) => () => void;
  readonly reconnect: () => void;
  readonly disposals: () => number;
} {
  const state: { notify: (() => void) | undefined; disposals: number } = {
    notify: undefined,
    disposals: 0,
  };
  const subscribe = (notify: () => void): (() => void) => {
    state.notify = notify;
    return () => {
      state.disposals += 1;
    };
  };
  return {
    subscribe,
    reconnect: () => state.notify?.(),
    disposals: () => state.disposals,
  };
}

describe('useReconnectLegRefetch (issue #154)', () => {
  it('does nothing before a reconnect fires', () => {
    const { subscribe } = fakeSubscribe();
    const fill = jest.fn();

    render(
      <Harness
        items={[{ id: '1', placeId: 'a' }]}
        startPlaceId="start"
        fill={fill}
        subscribe={subscribe}
      />,
    );

    expect(fill).not.toHaveBeenCalled();
  });

  it('offers every item to fill on reconnect, each with its leg origin', async () => {
    const { subscribe, reconnect } = fakeSubscribe();
    const fill = jest.fn().mockResolvedValue(undefined);
    const first: Item = { id: '1', placeId: 'a' };
    const second: Item = { id: '2', placeId: 'b' };

    render(
      <Harness
        items={[first, second]}
        startPlaceId="start"
        fill={fill}
        subscribe={subscribe}
      />,
    );
    await act(async () => {
      reconnect();
      await Promise.resolve();
    });

    expect(fill).toHaveBeenCalledWith(first, 'start');
    expect(fill).toHaveBeenCalledWith(second, 'a');
    expect(fill).toHaveBeenCalledTimes(2);
  });

  it('offers the latest items on reconnect without re-subscribing', async () => {
    const { subscribe, reconnect, disposals } = fakeSubscribe();
    const fill = jest.fn().mockResolvedValue(undefined);
    const first: Item = { id: '1', placeId: 'a' };
    const replaced: Item = { id: '1', placeId: 'a-2' };

    const { rerender } = render(
      <Harness
        items={[first]}
        startPlaceId="start"
        fill={fill}
        subscribe={subscribe}
      />,
    );
    rerender(
      <Harness
        items={[replaced]}
        startPlaceId="start"
        fill={fill}
        subscribe={subscribe}
      />,
    );
    await act(async () => {
      reconnect();
      await Promise.resolve();
    });

    expect(fill).toHaveBeenCalledWith(replaced, 'start');
    expect(fill).not.toHaveBeenCalledWith(first, 'start');
    // The effect subscribed once on mount and never tore down on rerender.
    expect(disposals()).toBe(0);
  });

  it('unsubscribes on unmount', () => {
    const { subscribe, disposals } = fakeSubscribe();
    const fill = jest.fn();

    const { unmount } = render(
      <Harness
        items={[]}
        startPlaceId={undefined}
        fill={fill}
        subscribe={subscribe}
      />,
    );
    unmount();

    expect(disposals()).toBe(1);
  });
});
