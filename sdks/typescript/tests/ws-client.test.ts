import { SidecarWsClient } from '../pmxt/ws-client';

describe('SidecarWsClient', () => {
  it('queues repeated data events instead of overwriting the latest event', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-firehose';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    client.dispatch({ event: 'data', id: requestId, symbol: 'a', data: { sequence: 1 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'b', data: { sequence: 2 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'c', data: { sequence: 3 } });

    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 1 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 2 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 3 });
  });

  it('resolves a pending waiter and queues later events in order', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-pending';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    const first = client.waitForData(requestId, 100);
    client.dispatch({ event: 'data', id: requestId, symbol: 'a', data: { sequence: 1 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'b', data: { sequence: 2 } });

    await expect(first).resolves.toEqual({ sequence: 1 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 2 });
  });

  it('clears queued events when closed', () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-close';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    client.dispatch({ event: 'data', id: requestId, symbol: 'a', data: { sequence: 1 } });
    client.dispatch({ event: 'data', id: requestId, symbol: 'b', data: { sequence: 2 } });

    expect(client.dataQueues.get(requestId)).toHaveLength(2);
    client.close();
    expect(client.dataQueues.has(requestId)).toBe(false);
    expect(client.dataStore.size).toBe(0);
  });

  it('drops the oldest queued events after the per-subscription cap', async () => {
    const client: any = new SidecarWsClient('http://localhost:3847');
    const requestId = 'req-overflow';

    client.subscriptions.set(requestId, {
      requestId,
      method: 'watchAllOrderBooks',
      symbols: [],
      resolve: null,
      reject: null,
    });

    for (let sequence = 1; sequence <= 100_001; sequence += 1) {
      client.dispatch({
        event: 'data',
        id: requestId,
        symbol: String(sequence),
        data: { sequence },
      });
    }

    expect(client.dataQueues.get(requestId)).toHaveLength(100_000);
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 2 });
    await expect(client.waitForData(requestId, 100)).resolves.toEqual({ sequence: 3 });
  });
});
