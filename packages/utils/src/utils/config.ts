import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { isNonEmptyString } from './validator';

export default function config(envFile: string = '.env') {
  // root path
  const rootPath = resolve(process.cwd());

  // working path
  const workingPath = resolve(dirname(require.main?.filename ?? ''));

  const filePath = join(rootPath, envFile);

  if (existsSync(filePath)) {
    // set environment
    const env = dotenv.config({
      path: filePath,
      quiet: true
    });

    if (env.error) {
      console.error(env.error);
      process.exit(1);
    }
  }

  // prefix
  const prefix = (process.env.ROUTE_PREFIX || '').split('/').map(uri => uri.trim()).filter(uri => uri.length).join('/');

  // set prefix
  process.env.ROUTE_PREFIX = `${isNonEmptyString(prefix) ? '/' : ''}${prefix}`;

  // set the working path
  process.env.WORKING_PATH = workingPath;

  // set the root path
  process.env.ROOT_PATH = rootPath;

  return {
    rootPath,
    workingPath,
    prefix
  };
}
