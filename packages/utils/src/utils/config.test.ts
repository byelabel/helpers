import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from './config';

describe('loadEnv', () => {
  let dir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  const trackedKeys = new Set<string>();
  const originals: Record<string, string | undefined> = {};

  function setEnvFile(name: string, contents: string) {
    writeFileSync(join(dir, name), contents);
  }

  function trackEnv(...keys: string[]) {
    for (const k of keys) {
      if (!trackedKeys.has(k)) {
        originals[k] = process.env[k];
        trackedKeys.add(k);
      }
    }
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'byelabel-config-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });

    for (const key of trackedKeys) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
    trackedKeys.clear();
  });

  it('returns rootPath equal to the resolved cwd', () => {
    const env = loadEnv();

    expect(env.rootPath).toBe(resolve(dir));
  });

  it('returns an absolute workingPath', () => {
    const env = loadEnv();

    expect(typeof env.workingPath).toBe('string');
    expect(env.workingPath.length).toBeGreaterThan(0);
  });

  it('returns an empty routePrefix when no .env file exists', () => {
    const env = loadEnv();

    expect(env.routePrefix).toBe('');
  });

  it('returns an empty routePrefix when .env has no ROUTE_PREFIX', () => {
    setEnvFile('.env', 'FOO=bar\n');
    trackEnv('FOO');

    const env = loadEnv();

    expect(env.routePrefix).toBe('');
  });

  it('normalizes a ROUTE_PREFIX with leading and trailing slashes', () => {
    setEnvFile('.env', 'ROUTE_PREFIX=/api/v1/\n');
    trackEnv('ROUTE_PREFIX');

    const env = loadEnv();

    expect(env.routePrefix).toBe('/api/v1');
  });

  it('adds a leading slash when ROUTE_PREFIX has none', () => {
    setEnvFile('.env', 'ROUTE_PREFIX=api/v1\n');
    trackEnv('ROUTE_PREFIX');

    const env = loadEnv();

    expect(env.routePrefix).toBe('/api/v1');
  });

  it('collapses repeated slashes and trims whitespace in segments', () => {
    setEnvFile('.env', 'ROUTE_PREFIX=///api// /v1///\n');
    trackEnv('ROUTE_PREFIX');

    const env = loadEnv();

    expect(env.routePrefix).toBe('/api/v1');
  });

  it('returns an empty routePrefix when ROUTE_PREFIX only contains slashes', () => {
    setEnvFile('.env', 'ROUTE_PREFIX=///\n');
    trackEnv('ROUTE_PREFIX');

    const env = loadEnv();

    expect(env.routePrefix).toBe('');
  });

  it('reads variables from a custom env file name', () => {
    setEnvFile('.env.staging', 'CUSTOM_VAR=hello\nROUTE_PREFIX=/staging\n');
    trackEnv('CUSTOM_VAR', 'ROUTE_PREFIX');

    const env = loadEnv('.env.staging');

    expect(env.routePrefix).toBe('/staging');
    expect(process.env.CUSTOM_VAR).toBe('hello');
  });

  it('does not throw when the requested env file is missing', () => {
    expect(() => loadEnv('.env.does-not-exist')).not.toThrow();
  });

  it('accepts an explicit vars override', () => {
    const env = loadEnv('.env', { vars: { ROUTE_PREFIX: '/from-vars' } });

    expect(env.routePrefix).toBe('/from-vars');
  });

  it('lets .env file values override vars when both are present', () => {
    setEnvFile('.env', 'ROUTE_PREFIX=/from-file\n');
    trackEnv('ROUTE_PREFIX');

    const env = loadEnv('.env', { vars: { ROUTE_PREFIX: '/from-vars' } });

    expect(env.routePrefix).toBe('/from-file');
  });
});

describe('loadEnv (browser runtime)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not touch the filesystem and reads routePrefix from vars', async () => {
    vi.stubGlobal('process', { env: {} });
    vi.resetModules();

    const { loadEnv: browserLoadEnv } = await import('./config.js');
    const env = browserLoadEnv('.env', { vars: { ROUTE_PREFIX: '/api' } });

    expect(env.rootPath).toBe('');
    expect(env.workingPath).toBe('');
    expect(env.routePrefix).toBe('/api');
  });

  it('falls back to globalThis.process.env when no vars override is given', async () => {
    vi.stubGlobal('process', { env: { ROUTE_PREFIX: '/from-env' } });
    vi.resetModules();

    const { loadEnv: browserLoadEnv } = await import('./config.js');
    const env = browserLoadEnv();

    expect(env.routePrefix).toBe('/from-env');
  });

  it('returns an empty routePrefix when nothing is provided', async () => {
    vi.stubGlobal('process', { env: {} });
    vi.resetModules();

    const { loadEnv: browserLoadEnv } = await import('./config.js');
    const env = browserLoadEnv();

    expect(env.routePrefix).toBe('');
  });

});