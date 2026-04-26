import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { isNonEmptyString } from './validator';

export function loadEnv(envFile = '.env') {
  // root path
  const rootPath = resolve(process.cwd());

  // working path
  const workingPath = resolve(dirname(require.main?.filename ?? ''));

  // load environment variables
  const filePath = join(rootPath, envFile);

  let prefix = '';

  if (existsSync(filePath)) {
    // set environment
    const env = dotenv.config({
      path: filePath,
      quiet: true
    });

    if (env.error) {
      console.error(env.error);
      process.exit(1);
    } else {
      // prefix
      prefix = (((env.parsed as any).ROUTE_PREFIX || '') as string).split('/').map(uri => uri.trim()).filter(uri => uri.length).join('/');

      console.log(`Environment variables loaded from "${filePath}"`);
    }
  }

  return {
    rootPath,
    workingPath,
    prefix: `${isNonEmptyString(prefix) ? '/' : ''}${prefix}`
  };
}

// autoload .env
const env = loadEnv();

// set the working path
process.env.WORKING_PATH = env.workingPath;

// set the root path
process.env.ROOT_PATH = env.rootPath;

// set prefix
process.env.ROUTE_PREFIX = env.prefix;
