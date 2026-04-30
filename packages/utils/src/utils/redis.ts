import process from 'node:process';
import { createClient, createCluster, RedisClientType, RedisClusterType } from 'redis';
import { AppError, throwAppError } from './error';
import { logInfo } from './log';
import { isNonEmptyString, isNumeric } from './validator';

const processId = process.pid;
const connection: Record<number, RedisClientType | RedisClusterType | null> = {
  [processId]: null
};

export type IRedisOptions = {
  host?: string;
  port?: number | string;
  user?: string;
  pass?: string;
  db?: number | string;
  flush?: boolean;
};

function resolveRedisOptions(options?: IRedisOptions): IRedisOptions {
  return {
    host: options?.host ?? process.env.REDIS_HOST,
    port: options?.port ?? Number(process.env.REDIS_PORT || 6379),
    user: options?.user ?? process.env.REDIS_USER,
    pass: options?.pass ?? process.env.REDIS_PASS,
    db: options?.db ?? process.env.REDIS_DB,
    flush: options?.flush ?? ['true', 'TRUE'].includes(process.env.REDIS_FLUSH_DB as string)
  };
}

export function checkRedisConfig(options?: IRedisOptions): IRedisOptions {
  const opts = resolveRedisOptions(options);

  if (!isNonEmptyString(opts.host)) {
    throwAppError('Redis host configuration not found', 'MISSING_REDIS_HOST');
  }

  return opts;
}

function createURI(host: string, port: string | number, user: string, pass: string, db?: string | number) {
  const url = ['redis://'];

  const auth = [
    isNonEmptyString(user) ? user : '',
    isNonEmptyString(pass) ? pass : ''
  ].filter(str => str.length);

  if (auth.length) {
    url.push(`${auth.join(':')}@`);
  }

  url.push(`${host}:${+port}`);

  if (isNumeric(db)) {
    url.push(`/${db}`);
  }

  return url.join('');
}

export function connect(options?: IRedisOptions): Promise<RedisClusterType | RedisClientType> {
  return new Promise(async (resolve, reject) => {
    try {
      if (connection[processId]) {
        resolve(connection[processId]);
      } else {
        const opts = checkRedisConfig(options);

        let client: any;

        const hosts = (opts.host as string || '').split(',').map(host => host.trim()).filter(host => host.length);
        const ports = String(opts.port ?? '').split(',').map(port => port.trim()).filter(port => port.length && isNumeric(port));
        const users = (opts.user as string || '').split(',').map(user => user.trim()).filter(user => user.length);
        const passes = (opts.pass as string || '').split(',').map(pass => pass.trim()).filter(pass => pass.length);

        if (hosts.length > 1) {
          client = createCluster({
            rootNodes: hosts.map((host, index) => ({
              url: createURI(host, (ports?.[index] || ports?.[0]), (users?.[index] || users?.[0]), (passes?.[index] || passes?.[0]))
            }))
          });
        } else {
          client = createClient({
            url: createURI(hosts[0], ports?.[0], users?.[0], passes?.[0], opts.db)
          });
        }

        client.on('ready', () => {
          connection[processId] = client;

          if (opts.flush) {
            // @ts-ignore
            client.sendCommand(['FLUSHDB']).then(flush => {
              logInfo(`Redis Flush DB: ${flush}`, true).catch(() => {});
            }).catch(() => {});
          }

          resolve(client);
        });

        client.on('error', (e: any) => {
          reject(new AppError(e, 'REDIS_ERROR'));
        });

        await client.connect();
      }
    } catch (e) {
      reject(new AppError((e as Error).message, 'REDIS_ERROR'));
    }
  });
}

export function disconnect(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      if (connection[processId]) {
        connection[processId].destroy();
        connection[processId] = null;
      }

      resolve();
    } catch (e) {
      reject(new AppError((e as Error).message, 'REDIS_ERROR'));
    }
  });
}
