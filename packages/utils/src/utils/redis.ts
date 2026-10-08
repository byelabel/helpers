import joi from 'joi';
import process from 'node:process';
import { createClient, createCluster, RedisClientType, RedisClusterType } from 'redis';
import { AppError, throwAppError } from './error';
import { logError, logWarning } from './log';
import { isNonEmptyString, isNumeric } from './validator';

const processId = process.pid;
const connection: Record<number, RedisClientType | RedisClusterType | null> = {
  [processId]: null
};
const connecting: Record<number, Promise<RedisClientType | RedisClusterType> | null> = {
  [processId]: null
};

export type IRedisOptions = {
  host?: string;
  port?: number | string;
  user?: string;
  pass?: string;
  db?: number | string;
  flush?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  retryMaxDelay?: number;
};

const optionsSchema = joi.object<IRedisOptions>({
  host: joi.string().trim().required(),
  port: joi.number().integer().min(0).default(6379),
  user: joi.string().trim().allow('').optional(),
  pass: joi.string().trim().allow('').optional(),
  db: joi.alternatives().try(joi.number().integer().min(0), joi.string().trim()).optional(),
  flush: joi.boolean().truthy('true', 'TRUE', 'True').falsy('false', 'FALSE', 'False').default(false),
  maxRetries: joi.number().integer().min(0).default(10),
  retryDelay: joi.number().integer().min(0).default(500),
  retryMaxDelay: joi.number().integer().min(0).default(5000)
});

export function checkRedisConfig(options?: IRedisOptions): IRedisOptions {
  const { error, value } = optionsSchema.validate({
    host: options?.host ?? process.env.REDIS_HOST,
    port: options?.port ?? process.env.REDIS_PORT,
    user: options?.user ?? process.env.REDIS_USER,
    pass: options?.pass ?? process.env.REDIS_PASS,
    db: options?.db ?? process.env.REDIS_DB,
    flush: options?.flush ?? process.env.REDIS_FLUSH_DB,
    maxRetries: options?.maxRetries ?? process.env.REDIS_MAX_RETRIES,
    retryDelay: options?.retryDelay ?? process.env.REDIS_RETRY_DELAY,
    retryMaxDelay: options?.retryMaxDelay ?? process.env.REDIS_RETRY_MAX_DELAY
  }, { abortEarly: false, stripUnknown: true });

  if (error) {
    throwAppError(`Invalid Redis configuration: ${error.message}`, `INVALID_REDIS_CONFIGURATION`, {
      field: error.details[0].path[0]
    });
  }

  return value;
}

export function createURI(host: string, port: string | number, user?: string, pass?: string, db?: string | number) {
  const url = ['redis://'];

  const username = isNonEmptyString(user) ? encodeURIComponent(user) : '';
  const password = isNonEmptyString(pass) ? encodeURIComponent(pass) : '';

  // `user:pass@`, `user@` or `:pass@` - the leading colon marks a password-only auth
  if (password) {
    url.push(`${username}:${password}@`);
  } else if (username) {
    url.push(`${username}@`);
  }

  url.push(`${host}:${+port}`);

  if (isNumeric(db)) {
    url.push(`/${db}`);
  }

  return url.join('');
}

function createRedisClient(opts: IRedisOptions): any {
  const hosts = (opts.host as string || '').split(',').map(host => host.trim()).filter(host => host.length);
  const ports = String(opts.port ?? '').split(',').map(port => port.trim()).filter(port => port.length && isNumeric(port));
  const users = (opts.user as string || '').split(',').map(user => user.trim()).filter(user => user.length);
  const passes = (opts.pass as string || '').split(',').map(pass => pass.trim()).filter(pass => pass.length);

  if (hosts.length > 1) {
    return createCluster({
      rootNodes: hosts.map((host, index) => ({
        url: createURI(host, (ports?.[index] || ports?.[0]), (users?.[index] || users?.[0]), (passes?.[index] || passes?.[0]))
      }))
    });
  }

  return createClient({
    url: createURI(hosts[0], ports?.[0], users?.[0], passes?.[0], opts.db)
  });
}

/**
 * One connect attempt: resolves on `ready`, rejects on the first error before it.
 * The client is destroyed on failure so its own reconnect loop does not linger.
 */
function connectOnce(opts: IRedisOptions): Promise<RedisClientType | RedisClusterType> {
  return new Promise((resolve, reject) => {
    const client = createRedisClient(opts);
    let settled = false;

    client.on('ready', () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(client);
    });

    client.on('error', (e: any) => {
      if (!settled) {
        settled = true;

        try { client.destroy(); } catch {}

        reject(e);
      } else {
        // after the first ready, node-redis reconnects on its own; only report it
        logError('Redis connection error', e, null, true).catch(() => {});
      }
    });

    client.connect().catch(() => {});
  });
}

export function connect(options?: IRedisOptions): Promise<RedisClusterType | RedisClientType> {
  if (connection[processId]) {
    return Promise.resolve(connection[processId]!);
  }

  if (connecting[processId]) {
    return connecting[processId]!;
  }

  connecting[processId] = (async () => {
    let opts: IRedisOptions;

    try {
      opts = checkRedisConfig(options);
    } catch (e) {
      connecting[processId] = null;
      throw new AppError((e as Error).message, 'REDIS_ERROR');
    }

    // at least one attempt, even with maxRetries = 0
    const maxRetries = Math.max(1, opts.maxRetries as number);
    const baseDelay = Math.max(0, opts.retryDelay as number);
    const maxDelay = Math.max(baseDelay, opts.retryMaxDelay as number);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const client = await connectOnce(opts);

        connection[processId] = client;
        connecting[processId] = null;

        if (opts.flush) {
          // @ts-ignore
          client.sendCommand(['FLUSHDB']).then(flush => {
            console.info(`Redis Flush DB: ${flush}`);
          }).catch(() => {});
        }

        return client;
      } catch (e) {
        lastError = e as Error;

        if (attempt + 1 < maxRetries) {
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));

          logWarning(`Redis connect failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms: ${lastError?.message}`, true).catch(() => {});

          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    connecting[processId] = null;

    throw new AppError(lastError?.message || 'Redis connect failed', 'REDIS_ERROR');
  })();

  return connecting[processId]!;
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
