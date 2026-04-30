import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from './error';
import { checkRabbitConfig } from './rabbit';

const ENV_KEYS = [
  'RABBIT_NAME',
  'RABBIT_PROTOCOL',
  'RABBIT_HOST',
  'RABBIT_PORT',
  'RABBIT_USER',
  'RABBIT_PASS',
  'RABBIT_VHOST',
  'RABBIT_NAMESPACE',
  'RABBIT_MESSAGE_MAX_SIZE',
  'RABBIT_TIMEOUT',
  'RABBIT_HEARTBEAT',
  'RABBIT_QUEUES',
  'RABBIT_EXCHANGES',
  'RABBIT_MAX_RETRIES',
  'RABBIT_RETRY_DELAY',
  'RABBIT_RETRY_MAX_DELAY',
  'RABBIT_KEEP_ALIVE',
  'RABBIT_KEEP_ALIVE_DELAY'
] as const;

describe('checkRabbitConfig', () => {
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
    expect(() => checkRabbitConfig()).toThrow(AppError);

    try {
      checkRabbitConfig();
    } catch (e) {
      expect((e as AppError).args?.field).toBe('host');
    }
  });

  it('applies expected defaults when only host is provided', () => {
    const opts = checkRabbitConfig({ host: 'localhost' });

    expect(opts.host).toBe('localhost');
    expect(opts.messageMaxSize).toBe(5000000);
    expect(opts.timeout).toBe(0);
    expect(opts.heartbeat).toBe(60);
    expect(opts.maxRetries).toBe(10);
    expect(opts.retryDelay).toBe(500);
    expect(opts.retryMaxDelay).toBe(5000);
    expect(opts.keepAlive).toBe(true);
    expect(opts.keepAliveDelay).toBe(10000);
  });

  it('reads numeric and string values from env', () => {
    process.env.RABBIT_HOST = 'rabbit.local';
    process.env.RABBIT_PORT = '5673';
    process.env.RABBIT_USER = 'guest';
    process.env.RABBIT_PASS = 'guest';
    process.env.RABBIT_VHOST = 'app';
    process.env.RABBIT_NAMESPACE = 'svc';
    process.env.RABBIT_QUEUES = 'a,b';
    process.env.RABBIT_EXCHANGES = 'x';
    process.env.RABBIT_HEARTBEAT = '30';
    process.env.RABBIT_MAX_RETRIES = '10';

    const opts = checkRabbitConfig();

    expect(opts.host).toBe('rabbit.local');
    expect(opts.port).toBe(5673);
    expect(opts.user).toBe('guest');
    expect(opts.pass).toBe('guest');
    expect(opts.vhost).toBe('app');
    expect(opts.namespace).toBe('svc');
    expect(opts.queues).toBe('a,b');
    expect(opts.exchanges).toBe('x');
    expect(opts.heartbeat).toBe(30);
    expect(opts.maxRetries).toBe(10);
  });

  it('options take priority over env', () => {
    process.env.RABBIT_HOST = 'env-host';
    process.env.RABBIT_HEARTBEAT = '99';

    const opts = checkRabbitConfig({ host: 'opt-host', heartbeat: 15 });

    expect(opts.host).toBe('opt-host');
    expect(opts.heartbeat).toBe(15);
  });

  it('keepAlive parses string env values', () => {
    process.env.RABBIT_HOST = 'h';

    process.env.RABBIT_KEEP_ALIVE = 'false';
    expect(checkRabbitConfig().keepAlive).toBe(false);

    process.env.RABBIT_KEEP_ALIVE = 'FALSE';
    expect(checkRabbitConfig().keepAlive).toBe(false);

    process.env.RABBIT_KEEP_ALIVE = 'true';
    expect(checkRabbitConfig().keepAlive).toBe(true);

    delete process.env.RABBIT_KEEP_ALIVE;
    expect(checkRabbitConfig().keepAlive).toBe(true);
  });

  it('rejects an unparseable keepAlive value', () => {
    process.env.RABBIT_HOST = 'h';
    process.env.RABBIT_KEEP_ALIVE = 'sometimes';

    expect(() => checkRabbitConfig()).toThrow(AppError);
  });

  it('rejects a non-numeric heartbeat', () => {
    process.env.RABBIT_HOST = 'h';
    process.env.RABBIT_HEARTBEAT = 'abc';

    expect(() => checkRabbitConfig()).toThrow(AppError);
  });
});
