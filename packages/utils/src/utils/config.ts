import { isFunction, isNonEmptyString, isNonNullObject } from './validator';

type EnvVars = Record<string, string | undefined>;

const isNodeRuntime = typeof process !== 'undefined' && isNonEmptyString(process?.versions?.node) && isFunction(process?.cwd);

function normalizeRoutePrefix(value: unknown): string {
  return ((value as string) || '').split('/').map(uri => uri.trim()).filter(uri => uri.length).join('/');
}

export interface LoadEnvOptions {
  // explicit env source — useful in browsers where the bundler exposes envs
  // through `import.meta.env` or a custom object
  vars?: EnvVars;
}

export function loadEnv(envFile: string = '.env', options: LoadEnvOptions = {}) {
  let rootPath = '';
  let workingPath = '';
  let parsedVars: EnvVars = isNonNullObject(options.vars) ? { ...options.vars } : {};

  if (isNodeRuntime) {
    // lazy-required so browser bundlers don't try to resolve node-only modules
    const dotenv = require('dotenv');
    const cluster = require('node:cluster');
    const { existsSync } = require('node:fs');
    const { dirname, join, resolve } = require('node:path');

    rootPath = resolve(process.cwd());
    workingPath = resolve(dirname(require.main?.filename ?? ''));

    const filePath = join(rootPath, envFile);

    if (existsSync(filePath)) {
      const env = dotenv.config({
        path: filePath,
        quiet: true
      });

      if (env.error) {
        console.error(env.error);
        process.exit(1);
      } else {
        parsedVars = { ...parsedVars, ...(env.parsed as EnvVars) };

        if (cluster.isPrimary) {
          console.log(`Environment variables loaded: "${envFile}"`);
        }
      }
    }
  } else if (typeof process !== 'undefined' && isNonNullObject(process?.env)) {
    // browser: pick up whatever the bundler inlined into process.env
    parsedVars = { ...(process.env as EnvVars), ...parsedVars };
  }

  const routePrefix = normalizeRoutePrefix(parsedVars.ROUTE_PREFIX);

  return {
    rootPath,
    workingPath,
    routePrefix: `${isNonEmptyString(routePrefix) ? '/' : ''}${routePrefix}`
  };
}

// autoload .env (Node only — browsers get their envs inlined by the bundler)
if (isNodeRuntime) {
  const env = loadEnv();

  // set the working path
  process.env.WORKING_PATH = env.workingPath;

  // set the root path
  process.env.ROOT_PATH = env.rootPath;

  // set route prefix
  process.env.ROUTE_PREFIX = env.routePrefix;
}
