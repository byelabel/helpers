import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from './error';
import { checkRedisConfig } from './redis';

const ENV_KEYS = ['REDIS_HOST', 'REDIS_PORT', 'REDIS_USER', 'REDIS_PASS', 'REDIS_DB', 'REDIS_FLUSH_DB'] as const;

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
      expect((e as AppError).code).toBe('INVALID_REDIS_HOST');
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

  it('rejects a non-numeric port', () => {
    process.env.REDIS_HOST = 'h';
    process.env.REDIS_PORT = 'abc';

    expect(() => checkRedisConfig()).toThrow(AppError);
  });
});
