import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// each test queues the outcome of the next connect attempts
const attempts: Array<'ready' | 'error'> = [];
const clients: any[] = [];

vi.mock('redis', () => {
  const make = () => {
    const client: any = new EventEmitter();
    const outcome = attempts.shift() ?? 'error';

    client.destroy = vi.fn();
    client.sendCommand = vi.fn(() => Promise.resolve('OK'));
    client.connect = vi.fn(() => {
      setImmediate(() => outcome === 'ready' ? client.emit('ready') : client.emit('error', new Error('connect ECONNREFUSED')));
      return Promise.resolve();
    });

    clients.push(client);

    return client;
  };

  return { createClient: vi.fn(make), createCluster: vi.fn(make) };
});

vi.mock('./log', () => ({
  logError: vi.fn(() => Promise.resolve()),
  logWarning: vi.fn(() => Promise.resolve())
}));

// imports must come after vi.mock
import { AppError } from './error';
import { checkRedisConfig, connect, createURI, disconnect } from './redis';

const ENV_KEYS = [
  'REDIS_HOST', 'REDIS_PORT', 'REDIS_USER', 'REDIS_PASS', 'REDIS_DB', 'REDIS_FLUSH_DB',
  'REDIS_MAX_RETRIES', 'REDIS_RETRY_DELAY', 'REDIS_RETRY_MAX_DELAY'
] as const;

describe('checkRedisConfig', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it('throws when host is missing from both options and env', () => {
    expect(() => checkRedisConfig()).toThrow(AppError);

    try {
      checkRedisConfig();
    } catch (e) {
      expect((e as AppError).args?.field).toBe('host');
    }
  });

  it('applies defaults for port and flush when only host is provided', () => {
    const opts = checkRedisConfig({ host: 'localhost' });

    expect(opts.host).toBe('localhost');
    expect(opts.port).toBe(6379);
    expect(opts.flush).toBe(false);
  });

  it('reads configuration from env when no options are passed', () => {
    process.env.REDIS_HOST = 'redis.local';
    process.env.REDIS_PORT = '6390';
    process.env.REDIS_USER = 'admin';
    process.env.REDIS_PASS = 'secret';
    process.env.REDIS_DB = '2';
    process.env.REDIS_FLUSH_DB = 'true';

    const opts = checkRedisConfig();

    expect(opts.host).toBe('redis.local');
    expect(opts.port).toBe(6390);
    expect(opts.user).toBe('admin');
    expect(opts.pass).toBe('secret');
    expect(opts.db).toBe(2);
    expect(opts.flush).toBe(true);
  });

  it('options take priority over env', () => {
    process.env.REDIS_HOST = 'env-host';
    process.env.REDIS_PORT = '1111';

    const opts = checkRedisConfig({ host: 'opt-host', port: 2222 });

    expect(opts.host).toBe('opt-host');
    expect(opts.port).toBe(2222);
  });

  it('parses flush as boolean from common string values', () => {
    expect(checkRedisConfig({ host: 'h', flush: 'TRUE' as any }).flush).toBe(true);
    expect(checkRedisConfig({ host: 'h', flush: 'true' as any }).flush).toBe(true);
    expect(checkRedisConfig({ host: 'h', flush: 'FALSE' as any }).flush).toBe(false);
    expect(checkRedisConfig({ host: 'h', flush: 'false' as any }).flush).toBe(false);
  });

  it('defaults flush to false when REDIS_FLUSH_DB is undefined', () => {
    expect(checkRedisConfig({ host: 'h' }).flush).toBe(false);
  });

  it('rejects an unparseable flush value', () => {
    expect(() => checkRedisConfig({ host: 'h', flush: 'maybe' as any })).toThrow(AppError);
  });

  it('applies retry defaults and reads them from env', () => {
    const opts = checkRedisConfig({ host: 'h' });

    expect(opts.maxRetries).toBe(10);
    expect(opts.retryDelay).toBe(500);
    expect(opts.retryMaxDelay).toBe(5000);

    process.env.REDIS_MAX_RETRIES = '3';
    process.env.REDIS_RETRY_DELAY = '10';
    process.env.REDIS_RETRY_MAX_DELAY = '20';

    expect(checkRedisConfig({ host: 'h' })).toMatchObject({ maxRetries: 3, retryDelay: 10, retryMaxDelay: 20 });
  });

  it('rejects a non-numeric port', () => {
    process.env.REDIS_HOST = 'h';
    process.env.REDIS_PORT = 'abc';

    expect(() => checkRedisConfig()).toThrow(AppError);
  });
});

describe('createURI', () => {
  it('builds a plain URI without auth', () => {
    expect(createURI('localhost', 6379)).toBe('redis://localhost:6379');
    expect(createURI('localhost', '6379', '', '')).toBe('redis://localhost:6379');
  });

  it('appends the db number when numeric', () => {
    expect(createURI('localhost', 6379, undefined, undefined, 2)).toBe('redis://localhost:6379/2');
    expect(createURI('localhost', 6379, undefined, undefined, '3')).toBe('redis://localhost:6379/3');
    expect(createURI('localhost', 6379, undefined, undefined, 'abc')).toBe('redis://localhost:6379');
  });

  it('includes user and password', () => {
    expect(createURI('localhost', 6379, 'admin', 'secret')).toBe('redis://admin:secret@localhost:6379');
  });

  it('uses a leading colon when only a password is set', () => {
    expect(createURI('localhost', 6379, '', 'secret')).toBe('redis://:secret@localhost:6379');
    expect(createURI('localhost', 6379, undefined, 'secret')).toBe('redis://:secret@localhost:6379');
  });

  it('includes only the user when no password is set', () => {
    expect(createURI('localhost', 6379, 'admin')).toBe('redis://admin@localhost:6379');
  });

  it('url-encodes special characters in credentials', () => {
    expect(createURI('localhost', 6379, 'us@er', 'p@ss/w:rd#?')).toBe('redis://us%40er:p%40ss%2Fw%3Ard%23%3F@localhost:6379');

    const url = new URL(createURI('localhost', 6379, '', 'p@ss/w:rd#?'));

    expect(url.username).toBe('');
    expect(decodeURIComponent(url.password)).toBe('p@ss/w:rd#?');
    expect(url.hostname).toBe('localhost');
  });
});

describe('connect', () => {
  beforeEach(async () => {
    attempts.length = 0;
    clients.length = 0;
    await disconnect();
  });

  it('retries until redis is ready', async () => {
    attempts.push('error', 'error', 'ready');

    const client = await connect({ host: 'h', maxRetries: 5, retryDelay: 1, retryMaxDelay: 2 });

    expect(clients).toHaveLength(3);
    expect(client).toBe(clients[2]);
    expect(clients[0].destroy).toHaveBeenCalled();
    expect(clients[1].destroy).toHaveBeenCalled();
  });

  it('rejects with REDIS_ERROR once the attempts run out', async () => {
    attempts.push('error', 'error', 'error');

    await expect(connect({ host: 'h', maxRetries: 3, retryDelay: 1 })).rejects.toMatchObject({ code: 'REDIS_ERROR' });
    expect(clients).toHaveLength(3);
  });

  it('shares one attempt between concurrent callers and reuses the connection', async () => {
    attempts.push('ready');

    const [a, b] = await Promise.all([connect({ host: 'h' }), connect({ host: 'h' })]);

    expect(a).toBe(b);
    expect(await connect({ host: 'h' })).toBe(a);
    expect(clients).toHaveLength(1);
  });

  it('does not fail the connection on an error after ready', async () => {
    attempts.push('ready');

    const client: any = await connect({ host: 'h' });

    client.emit('error', new Error('socket closed'));

    expect(await connect({ host: 'h' })).toBe(client);
    expect(client.destroy).not.toHaveBeenCalled();
  });
});
