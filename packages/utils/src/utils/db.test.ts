import { isAbsolute } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDBConfig } from './db';
import { AppError } from './error';

const ENV_KEYS = [
  'DB_ENGINE',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASS',
  'DB_USE_SSL',
  'DB_PREFIX',
  'DB_SKIP_SYNC',
  'DB_FORCE_SYNC',
  'DB_DEBUG',
  'DB_MODEL_PATH'
] as const;

const baseRequired = { host: 'localhost', name: 'byelabel', user: 'postgres' };

describe('checkDBConfig', () => {
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
    expect(() => checkDBConfig()).toThrow(AppError);

    try {
      checkDBConfig();
    } catch (e) {
      expect((e as AppError).args?.field).toBe('host');
    }
  });

  it('throws when name is missing', () => {
    try {
      checkDBConfig({ host: 'localhost', user: 'postgres' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).args?.field).toBe('name');
    }
  });

  it('throws when user is missing', () => {
    try {
      checkDBConfig({ host: 'localhost', name: 'byelabel' });
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).args?.field).toBe('user');
    }
  });

  it('applies defaults for boolean flags when only required are provided', () => {
    const opts = checkDBConfig(baseRequired);

    expect(opts.host).toBe('localhost');
    expect(opts.name).toBe('byelabel');
    expect(opts.user).toBe('postgres');
    expect(opts.useSSL).toBe(false);
    expect(opts.skipSync).toBe(false);
    expect(opts.forceSync).toBe(false);
    expect(opts.debug).toBe(false);
  });

  it('reads configuration from env when no options are passed', () => {
    process.env.DB_ENGINE = 'postgres';
    process.env.DB_HOST = 'db.local';
    process.env.DB_PORT = '5433';
    process.env.DB_NAME = 'byelabel';
    process.env.DB_USER = 'admin';
    process.env.DB_PASS = 'secret';
    process.env.DB_USE_SSL = 'true';
    process.env.DB_PREFIX = 'acc_';
    process.env.DB_SKIP_SYNC = 'TRUE';
    process.env.DB_FORCE_SYNC = 'false';
    process.env.DB_DEBUG = 'true';

    const opts = checkDBConfig();

    expect(opts.engine).toBe('postgres');
    expect(opts.host).toBe('db.local');
    expect(opts.port).toBe(5433);
    expect(opts.name).toBe('byelabel');
    expect(opts.user).toBe('admin');
    expect(opts.pass).toBe('secret');
    expect(opts.useSSL).toBe(true);
    expect(opts.prefix).toBe('acc_');
    expect(opts.skipSync).toBe(true);
    expect(opts.forceSync).toBe(false);
    expect(opts.debug).toBe(true);
  });

  it('options take priority over env', () => {
    process.env.DB_HOST = 'env-host';
    process.env.DB_NAME = 'env-name';
    process.env.DB_USER = 'env-user';

    const opts = checkDBConfig({ host: 'opt-host', name: 'opt-name', user: 'opt-user' });

    expect(opts.host).toBe('opt-host');
    expect(opts.name).toBe('opt-name');
    expect(opts.user).toBe('opt-user');
  });

  it('keeps comma-separated host as a string for read replicas', () => {
    const opts = checkDBConfig({ ...baseRequired, host: 'primary.local,replica1.local,replica2.local' });

    expect(opts.host).toBe('primary.local,replica1.local,replica2.local');
  });

  it('keeps comma-separated port as a string when not a single integer', () => {
    const opts = checkDBConfig({ ...baseRequired, port: '5432,5433' });

    expect(opts.port).toBe('5432,5433');
  });

  it('parses boolean flags from common string values', () => {
    expect(checkDBConfig({ ...baseRequired, useSSL: 'TRUE' as any }).useSSL).toBe(true);
    expect(checkDBConfig({ ...baseRequired, useSSL: 'true' as any }).useSSL).toBe(true);
    expect(checkDBConfig({ ...baseRequired, useSSL: 'FALSE' as any }).useSSL).toBe(false);
    expect(checkDBConfig({ ...baseRequired, useSSL: 'false' as any }).useSSL).toBe(false);
  });

  it('rejects an unparseable boolean value', () => {
    expect(() => checkDBConfig({ ...baseRequired, debug: 'maybe' as any })).toThrow(AppError);
  });

  it('rejects a negative port', () => {
    expect(() => checkDBConfig({ ...baseRequired, port: -1 })).toThrow(AppError);
  });

  it('resolves modelPath to an absolute path when omitted', () => {
    const opts = checkDBConfig(baseRequired);

    expect(typeof opts.modelPath).toBe('string');
    expect(isAbsolute(opts.modelPath as string)).toBe(true);
  });

  it('resolves a provided modelPath to an absolute path', () => {
    const opts = checkDBConfig({ ...baseRequired, modelPath: '/tmp/models' });

    expect(opts.modelPath).toBe('/tmp/models');
  });

  it('strips unknown fields from the result', () => {
    const opts = checkDBConfig({ ...baseRequired, foo: 'bar' } as any);

    expect((opts as any).foo).toBeUndefined();
  });
});