import { InMemoryObjectStorage } from './in-memory-object-storage.js';

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('InMemoryObjectStorage', () => {
  it('round-trips a put through get with its content type', async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put('stops/s1/a1', Buffer.from('map bytes'), 'image/png');

    const stored = await storage.get('stops/s1/a1');

    expect(stored.contentType).toBe('image/png');
    const bytes = await drain(stored.body);
    expect(bytes.toString()).toBe('map bytes');
  });

  it('rejects a get of a missing key', async () => {
    const storage = new InMemoryObjectStorage();
    await expect(storage.get('stops/s1/gone')).rejects.toThrow('No such key');
  });

  it('deletes one key, leaving siblings alone', async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put('stops/s1/a1', Buffer.from('x'), 'image/png');
    await storage.put('stops/s1/a2', Buffer.from('y'), 'image/png');

    await storage.delete('stops/s1/a1');

    expect(storage.keys()).toEqual(['stops/s1/a2']);
  });

  it('deletes everything under a prefix and nothing outside it', async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put('stops/s1/a1', Buffer.from('x'), 'image/png');
    await storage.put('stops/s1/a2', Buffer.from('y'), 'image/png');
    await storage.put('stops/s2/b1', Buffer.from('z'), 'image/png');

    await storage.deletePrefix('stops/s1/');

    expect(storage.keys()).toEqual(['stops/s2/b1']);
  });
});
