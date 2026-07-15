import { Readable } from 'node:stream';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory broker that models the surface of amqplib used by rabbit.ts.
// Pending messages sit in the queue's backlog until a consumer attaches;
// each consumer drains its delivery queue serially so chunks arrive in order.
class FakeBroker {
  queues = new Map<string, any[]>();
  consumers = new Map<string, { tag: string, handler: Function, deliveryQueue: any[], busy: boolean }>();
  tagCounter = 0;
  qCounter = 0;

  reset() {
    this.queues.clear();
    this.consumers.clear();
    this.tagCounter = 0;
    this.qCounter = 0;
  }

  async deliver(queue: string) {
    const c = this.consumers.get(queue);

    if (!c || c.busy) return;

    c.busy = true;

    while (c.deliveryQueue.length) {
      const msg = c.deliveryQueue.shift();
      await c.handler(msg);

      const current = this.consumers.get(queue);

      if (!current || current.tag !== c.tag) return; // cancelled mid-drain
    }

    c.busy = false;
  }

  async assertQueue(name: string) {
    const q = name && name.length ? name : `q.${this.qCounter++}`;

    if (!this.queues.has(q)) this.queues.set(q, []);

    return { queue: q };
  }

  async consume(queue: string, handler: Function) {
    const tag = `tag.${this.tagCounter++}`;
    const pending = this.queues.get(queue) ?? [];

    this.queues.set(queue, []);
    this.consumers.set(queue, { tag, handler, deliveryQueue: pending.slice(), busy: false });

    setImmediate(() => this.deliver(queue));

    return { consumerTag: tag };
  }

  async cancel(tag: string) {
    for (const [q, c] of this.consumers) {
      if (c.tag === tag) {
        this.consumers.delete(q);
        return;
      }
    }
  }

  async deleteQueue(queue: string) {
    this.queues.delete(queue);
    this.consumers.delete(queue);
  }

  sendToQueue(queue: string, content: Buffer, properties: any = {}) {
    const msg = { content, properties, fields: { routingKey: queue } };
    const c = this.consumers.get(queue);

    if (c) {
      c.deliveryQueue.push(msg);
      setImmediate(() => this.deliver(queue));
    } else {
      const list = this.queues.get(queue) ?? [];
      list.push(msg);
      this.queues.set(queue, list);
    }

    return true;
  }

  async waitForConfirms() {}
  ack(_: any) {}
}

const broker = new FakeBroker();

const fakeChannel: any = {
  assertQueue: (n: string, _opts?: any) => broker.assertQueue(n),
  consume: (q: string, h: Function, _opts?: any) => broker.consume(q, h),
  sendToQueue: (q: string, c: Buffer, p: any, cb?: Function) => {
    broker.sendToQueue(q, c, p);
    if (cb) cb();
    return true;
  },
  cancel: (t: string) => broker.cancel(t),
  deleteQueue: (q: string) => broker.deleteQueue(q),
  waitForConfirms: () => broker.waitForConfirms(),
  ack: (m: any) => broker.ack(m),
  prefetch: () => Promise.resolve(),
  on: () => fakeChannel,
  assertExchange: () => Promise.resolve({ exchange: '' }),
  bindQueue: () => Promise.resolve(),
  publish: () => true
};

const fakeConnection: any = {
  createConfirmChannel: () => Promise.resolve(fakeChannel),
  close: () => Promise.resolve(),
  on: () => fakeConnection
};

vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn(() => Promise.resolve(fakeConnection))
  }
}));

// imports must come after vi.mock
import { connect, receiveMessage, sendMessageForReplyStream } from './rabbit';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const c of stream) chunks.push(c as Buffer);

  return Buffer.concat(chunks);
}

describe('rabbit streaming reply', () => {
  beforeAll(async () => {
    // Small chunk size so multi-chunk paths are exercised without big buffers.
    process.env.RABBIT_HOST = 'localhost';
    process.env.RABBIT_MESSAGE_MAX_SIZE = '32';
    // Prime the cached channel/config once; subsequent tests reuse it.
    await connect();
  });

  beforeEach(() => {
    broker.reset();
  });

  it('round-trips a small Readable as a stream reply', async () => {
    const payload = Buffer.from('hello stream');

    await receiveMessage('file', () => ({ payload: Readable.from(payload) }));

    const reply = await sendMessageForReplyStream('file', { id: 1 });
    const buf = await readAll(reply);

    expect(buf.equals(payload)).toBe(true);
  });

  it('chunks larger payloads across multiple messages and reassembles in order', async () => {
    // 200 bytes / 32-byte chunk size = 7 chunks (last one partial + final marker).
    const payload = Buffer.alloc(200);

    for (let i = 0; i < payload.length; i++) payload[i] = i % 256;

    await receiveMessage('big', () => ({ payload: Readable.from(payload) }));

    const reply = await sendMessageForReplyStream('big', {});
    const buf = await readAll(reply);

    expect(buf.equals(payload)).toBe(true);
  });

  it('handles an empty Readable', async () => {
    await receiveMessage('empty', () => ({ payload: Readable.from(Buffer.alloc(0)) }));

    const reply = await sendMessageForReplyStream('empty', {});
    const buf = await readAll(reply);

    expect(buf.byteLength).toBe(0);
  });

  it('propagates producer-side errors via stream error', async () => {
    const failing = new Readable({
      read() {
        this.destroy(new Error('disk fail'));
      }
    });

    await receiveMessage('broken', () => ({ payload: failing }));

    const reply = await sendMessageForReplyStream('broken', {});

    await expect(readAll(reply)).rejects.toThrow('disk fail');
  });

  it('forwards a producer error after some chunks have already streamed', async () => {
    // Emits 64 bytes (two chunks at messageMaxSize=32) then errors.
    const partial = new Readable({
      read() {
        this.push(Buffer.alloc(32, 0x41));
        this.push(Buffer.alloc(32, 0x42));
        this.destroy(new Error('mid-stream fail'));
      }
    });

    await receiveMessage('partial', () => ({ payload: partial }));

    const reply = await sendMessageForReplyStream('partial', {});

    await expect(readAll(reply)).rejects.toThrow('mid-stream fail');
  });

  it('wraps non-streaming buffered replies in a Readable', async () => {
    // Handler returns a plain payload — exercises the legacy buffered fallback.
    await receiveMessage('echo', (params: any) => ({ payload: params.data }));

    const reply = await sendMessageForReplyStream('echo', { hello: 'world' });
    const buf = await readAll(reply);
    const parsed = JSON.parse(buf.toString());

    expect(parsed.data.payload).toEqual({ hello: 'world' });
  });
});