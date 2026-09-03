import amqp from 'amqplib';
import joi from 'joi';
import { randomUUID as uuid } from 'node:crypto';
import process from 'node:process';
import { Readable } from 'node:stream';
import { AppError, throwAppError } from './error';
import eventEmitter from './events';
import { logError, logInfo, logWarning } from './log';
import { isFunction, isNonEmptyString, isNumber, isNumeric, isUUID } from './validator';

type IStreamHeader = {
  id: string,
  queue: string,
  index: number,
  length: number,
  streaming?: boolean,
  final?: boolean,
  error?: string
};

type IStream = {
  index: number,
  content: Buffer
};

type ISendMessageOptions = {
  timeout?: number
};

export type IRabbitOptions = {
  name?: string,
  protocol?: string,
  host?: string,
  port?: number | string,
  user?: string,
  pass?: string,
  vhost?: string,
  namespace?: string,
  messageMaxSize?: number,
  timeout?: number,
  heartbeat?: number,
  prefetch?: number,
  queues?: string,
  exchanges?: string,
  maxRetries?: number,
  retryDelay?: number,
  retryMaxDelay?: number,
  keepAlive?: boolean,
  keepAliveDelay?: number
};

const processId = process.pid;

const connection: { [key: number]: amqp.ChannelModel | null } = {
  [processId]: null
};

const channel: { [key: number]: amqp.ConfirmChannel | null } = {
  [processId]: null
};

const connecting: { [key: number]: Promise<{ connection: amqp.ChannelModel, channel: amqp.ConfirmChannel }> | null } = {
  [processId]: null
};


// RabbitMQ direct reply-to: RPC replies arrive on the `amq.rabbitmq.reply-to`
// pseudo-queue, consumed in no-ack mode on the same channel that publishes the
// request. No queue is declared per call, so nothing can leak on the broker
// when a caller times out, crashes or loses its channel.
// https://www.rabbitmq.com/docs/direct-reply-to
const DIRECT_REPLY_TO = 'amq.rabbitmq.reply-to';

type IReplyWaiter = {
  onReply: (message: amqp.ConsumeMessage) => void,
  onError: (error: Error) => void
};

// in-flight RPC calls of this process, by correlation id
const replyWaiters: { [correlationId: string]: IReplyWaiter } = {};

// one reply consumer per channel; a new channel after a reconnect gets its own
const replyConsumers = new WeakMap<amqp.Channel, Promise<void>>();

let config: IRabbitOptions = {};

const optionsSchema = joi.object<IRabbitOptions>({
  name: joi.string().trim().allow('').optional(),
  protocol: joi.string().trim().allow('').optional(),
  host: joi.string().trim().required(),
  port: joi.alternatives().try(joi.number().integer().min(0), joi.string().trim()).optional(),
  user: joi.string().trim().allow('').optional(),
  pass: joi.string().trim().allow('').optional(),
  vhost: joi.string().trim().allow('').optional(),
  namespace: joi.string().trim().allow('').optional(),
  messageMaxSize: joi.number().integer().min(0).default(5000000),
  timeout: joi.number().min(0).default(0),
  heartbeat: joi.number().integer().min(0).default(60),
  prefetch: joi.number().integer().min(0).default(10),
  queues: joi.string().trim().allow('').optional(),
  exchanges: joi.string().trim().allow('').optional(),
  maxRetries: joi.number().integer().min(0).default(10),
  retryDelay: joi.number().integer().min(0).default(500),
  retryMaxDelay: joi.number().integer().min(0).default(5000),
  keepAlive: joi.boolean().truthy('true', 'TRUE', 'True').falsy('false', 'FALSE', 'False').default(true),
  keepAliveDelay: joi.number().integer().min(0).default(10000)
});

export function checkRabbitConfig(options?: IRabbitOptions): IRabbitOptions {
  const { error, value } = optionsSchema.validate({
    name: options?.name ?? process.env.RABBIT_NAME,
    protocol: options?.protocol ?? process.env.RABBIT_PROTOCOL,
    host: options?.host ?? process.env.RABBIT_HOST,
    port: options?.port ?? process.env.RABBIT_PORT,
    user: options?.user ?? process.env.RABBIT_USER,
    pass: options?.pass ?? process.env.RABBIT_PASS,
    vhost: options?.vhost ?? process.env.RABBIT_VHOST,
    namespace: options?.namespace ?? process.env.RABBIT_NAMESPACE,
    messageMaxSize: options?.messageMaxSize ?? process.env.RABBIT_MESSAGE_MAX_SIZE,
    timeout: options?.timeout ?? process.env.RABBIT_TIMEOUT,
    heartbeat: options?.heartbeat ?? process.env.RABBIT_HEARTBEAT,
    prefetch: options?.prefetch ?? process.env.RABBIT_PREFETCH,
    queues: options?.queues ?? process.env.RABBIT_QUEUES,
    exchanges: options?.exchanges ?? process.env.RABBIT_EXCHANGES,
    maxRetries: options?.maxRetries ?? process.env.RABBIT_MAX_RETRIES,
    retryDelay: options?.retryDelay ?? process.env.RABBIT_RETRY_DELAY,
    retryMaxDelay: options?.retryMaxDelay ?? process.env.RABBIT_RETRY_MAX_DELAY,
    keepAlive: options?.keepAlive ?? process.env.RABBIT_KEEP_ALIVE,
    keepAliveDelay: options?.keepAliveDelay ?? process.env.RABBIT_KEEP_ALIVE_DELAY
  }, { abortEarly: false, stripUnknown: true });

  if (error) {
    throwAppError(`Invalid RabbitMQ configuration: ${error.message}`, `INVALID_RABBIT_CONFIGURATION`, {
      field: error.details[0].path[0]
    });
  }

  return value;
}

function createURI(opts: IRabbitOptions): string {
  const url = [`${isNonEmptyString(opts.protocol) ? opts.protocol : 'amqp'}://`];

  const auth = [
    isNonEmptyString(opts.user) ? opts.user : '',
    isNonEmptyString(opts.pass) ? opts.pass : ''
  ].filter(str => !!str?.length);

  if (auth.length) {
    url.push(`${auth.join(':')}@`);
  }

  url.push(`${opts.host}:${opts.port || 5672}`);

  if (isNonEmptyString(opts.vhost)) {
    url.push(`/${opts.vhost}`);
  }

  if (isNumber(opts.heartbeat)) {
    url.push(`?heartbeat=${opts.heartbeat}`);
  }

  return url.join('');
}

export function connect(options?: IRabbitOptions): Promise<{
  connection: amqp.ChannelModel,
  channel: amqp.ConfirmChannel
}> {
  if (connection[processId] && channel[processId]) {
    return Promise.resolve({
      connection: connection[processId]!,
      channel: channel[processId]!
    });
  }

  if (connecting[processId]) {
    return connecting[processId]!;
  }

  connecting[processId] = (async () => {
    // update resolved configuration
    config = checkRabbitConfig(options);

    const maxRetries = Math.max(0, config.maxRetries as number);
    const baseDelay = Math.max(0, config.retryDelay as number);
    const maxDelay = Math.max(baseDelay, config.retryMaxDelay as number);

    // set namespace & messageMaxSize
    config.namespace = isNonEmptyString(config.namespace) ? `${config.namespace}/` : '';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!connection[processId]) {
          const conn = await amqp.connect(createURI(config), {
            keepAlive: config.keepAlive,
            keepAliveDelay: config.keepAliveDelay,
            clientProperties: {
              connection_name: `${(config?.name || process.env.NAME || 'Microservice').toLowerCase().replace(/[^a-z0-9-_]/i, '-')}-${processId}`
            }
          });
          connection[processId] = conn;

          conn.on('error', e => {
            const code = (e as any)?.code;
            logError('RabbitMQ connection error', e, code ? { code } : null, true).catch(() => {});
          }).on('close', () => {
            logWarning('RabbitMQ connection closed', true).catch(() => {});

            // reset
            connection[processId] = null;
            channel[processId] = null;
          });
        }

        if (!channel[processId]) {
          const ch = await connection[processId]!.createConfirmChannel();
          channel[processId] = ch;

          // per-consumer cap on unacked deliveries; 0 = unlimited
          if ((config.prefetch as number) > 0) {
            await ch.prefetch(config.prefetch as number);
          }

          ch.on('error', e => {
            const code = (e as any)?.code;
            logError('RabbitMQ channel error', e, code ? { code } : null, true).catch(() => {});
          }).on('close', () => {
            logWarning('RabbitMQ channel closed', true).catch(() => {});

            // reset
            channel[processId] = null;

            // replies to our own calls cannot arrive any more either
            failReplyWaiters(new AppError('RabbitMQ channel closed before the reply arrived', 'CHANNEL_CLOSED'));
          });
        }

        connecting[processId] = null;

        return {
          connection: connection[processId]!,
          channel: channel[processId]!
        };
      } catch (e) {
        lastError = e as Error;

        // discard partial state so the next attempt starts clean
        try { await connection[processId]?.close(); } catch {}

        connection[processId] = null;
        channel[processId] = null;

        if (attempt < maxRetries) {
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));

          logWarning(`RabbitMQ connect failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms: ${lastError.message}`, true).catch(() => {});

          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    connecting[processId] = null;

    throw new AppError(lastError?.message || 'RabbitMQ connect failed', 'RABBITMQ_ERROR');
  })();

  return connecting[processId]!;
}

export function disconnect(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      if (channel[processId]) {
        await channel[processId].close();
        channel[processId] = null;
      }

      if (connection[processId]) {
        await connection[processId].close();
        connection[processId] = null;
      }

      resolve();
    } catch (e) {
      reject(new AppError((e as Error).message, 'RABBITMQ_ERROR'));
    }
  });
}

/**
 * Attach the direct reply-to consumer to the channel (once). Must complete
 * before a request that expects a reply is published on that channel.
 */
function ensureReplyConsumer(ch: amqp.ConfirmChannel): Promise<void> {
  let ready = replyConsumers.get(ch);

  if (!ready) {
    ready = ch.consume(DIRECT_REPLY_TO, (message) => {
      const correlationId = message?.properties?.correlationId;
      const waiter = correlationId ? replyWaiters[correlationId] : null;

      // a reply that arrives after its call timed out has no waiter and is dropped
      if (message && waiter) {
        waiter.onReply(message);
      }
    }, {
      noAck: true
    }).then(() => {}).catch(e => {
      replyConsumers.delete(ch);

      throw e;
    });

    replyConsumers.set(ch, ready);
  }

  return ready;
}

/**
 * Fail every in-flight RPC call; replies cannot arrive on a closed channel.
 */
function failReplyWaiters(error: Error): void {
  for (const correlationId of Object.keys(replyWaiters)) {
    const waiter = replyWaiters[correlationId];

    delete replyWaiters[correlationId];

    try { waiter.onError(error); } catch {}
  }
}

/**
 * Split `account.find` into the queue (`account`) and the pattern (`find`).
 */
function parseTarget(name: string): { queue: string, pattern: string | null } {
  let queue = name, pattern: string | null = null;

  if (queue.lastIndexOf('.') > -1) {
    pattern = queue.substring(queue.indexOf('.') + 1);
    queue = queue.substring(0, queue.indexOf('.'));
  }

  return {
    queue: `${config.namespace}${queue}`,
    pattern
  };
}

function receiveStream(message: amqp.Message): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    let streamChannel: amqp.Channel | null = null;

    try {
      const { connection } = await connect();
      const headers = message?.properties?.headers as IStreamHeader | undefined;

      if (headers && isNumber(headers.index) && (headers.index === 0)) {
        // consume the chunk queue on a dedicated channel so a missing or
        // expired queue (404) cannot kill the shared channel; the caller can
        // then ack & drop the orphaned first chunk instead of the broker
        // redelivering it forever
        streamChannel = await connection.createChannel();

        // failures surface through the returned promise, not the logs
        streamChannel.on('error', () => {});

        let settled = false;
        let timer: NodeJS.Timeout | null = null;

        const cleanup = async (error?: Error) => {
          if (settled) return;
          settled = true;

          if (timer) {
            clearTimeout(timer);
          }

          const ch = streamChannel;
          streamChannel = null;

          if (ch) {
            await ch.deleteQueue(headers.queue).catch(() => {});
            await ch.close().catch(() => {});
          }

          if (error) {
            reject(error);
          }
        };

        // if the remaining chunks never arrive, give up so the caller can
        // drop the message; without this the delivery would stay
        // unacknowledged until the broker kills the channel
        timer = setTimeout(() => {
          cleanup(new AppError(`Stream chunks not received (${headers.queue})`, 'STREAM_TIMEOUT')).catch(() => {});
        }, (config.timeout || 30) * 1000);

        // stream content
        const stream: IStream[] = [];

        // push first content
        stream.push({
          index: headers.index,
          content: message.content
        });

        try {
          await streamChannel.consume(headers.queue, async (streamMessage) => {
            if (!streamMessage || settled) return;

            const streamHeaders = streamMessage.properties?.headers as IStreamHeader | undefined;

            if (streamHeaders && isUUID(headers.id) && (streamMessage.properties?.correlationId === headers.id) && isNumber(streamHeaders.index) && isNumber(headers.length) && (stream.length < headers.length)) {
              try { streamChannel?.ack(streamMessage); } catch {}

              stream.push({
                index: streamHeaders.index,
                content: streamMessage.content
              });

              if (stream.length === headers.length) {
                resolve(Buffer.concat(stream.sort((a, b) => a.index - b.index).map(buffer => buffer.content)));

                await cleanup();
              }
            }
          }, {
            noAck: false
          });
        } catch (e) {
          // the chunk queue is gone (expired or lost with its channel); the
          // remaining chunks are unrecoverable, so the message must be dropped
          await cleanup(new AppError(`Stream chunks lost (${headers.queue})`, 'STREAM_CHUNKS_LOST'));
        }
      } else {
        resolve(message.content);
      }
    } catch (e) {
      if (streamChannel) {
        streamChannel.close().catch(() => {});
      }

      reject(e);
    }
  });
}

function sendReadableStream(replyQueue: string, source: Readable, properties: amqp.Options.Publish, options?: ISendMessageOptions): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();
      const max = config.messageMaxSize as number;

      const q = await channel.assertQueue('', {
        durable: true,
        autoDelete: true,
        expires: (isNumeric(options?.timeout) ? +(options!.timeout as number) : (config.timeout || 30)) * 1000
      });

      const id = uuid();

      let index = 0;
      let carry: Buffer = Buffer.alloc(0);

      const flush = (buf: Buffer, final: boolean) => {
        const target = index === 0 ? replyQueue : q.queue;
        const headers: IStreamHeader = {
          id,
          queue: q.queue,
          index,
          length: 0,
          streaming: true,
          final
        };

        channel.sendToQueue(target, buf, {
          ...(index === 0 ? properties : { correlationId: id }),
          headers
        });

        index++;
      };

      try {
        for await (const chunk of source) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          carry = Buffer.concat([carry, buf]);

          while (carry.byteLength >= max) {
            flush(carry.subarray(0, max), false);
            carry = carry.subarray(max);
          }
        }

        // final chunk (maybe empty) marks end-of-stream
        flush(carry, true);

        await channel.waitForConfirms().catch(() => {});
      } catch (e) {
        const headers: IStreamHeader = {
          id,
          queue: q.queue,
          index,
          length: 0,
          streaming: true,
          final: true,
          error: (e as Error).message
        };

        channel.sendToQueue(index === 0 ? replyQueue : q.queue, Buffer.alloc(0), {
          ...(index === 0 ? properties : { correlationId: id }),
          headers
        });

        await channel.waitForConfirms().catch(() => {});
      }

      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function receiveStreamAsReadable(firstMessage: amqp.Message): Readable {
  const headers = firstMessage.properties.headers as IStreamHeader;
  const readable = new Readable({ read() {} });

  let streamChannel: amqp.Channel | null = null;

  const cleanup = async () => {
    const ch = streamChannel;
    streamChannel = null;

    if (ch) {
      await ch.deleteQueue(headers.queue).catch(() => {});
      await ch.close().catch(() => {});
    }
  };

  if (firstMessage.content.byteLength) readable.push(firstMessage.content);

  if (headers.final) {
    if (headers.error) {
      // the caller has not received the readable yet; let it attach its
      // listeners before the error is emitted
      setImmediate(() => readable.destroy(new Error(headers.error)));
    } else {
      readable.push(null);
    }

    return readable;
  }

  (async () => {
    const { connection } = await connect();

    // consume the chunk queue on a dedicated channel so a missing or expired
    // queue (404) cannot kill the shared channel
    streamChannel = await connection.createChannel();

    // failures surface through the readable, not the logs
    streamChannel.on('error', () => {});

    await streamChannel.consume(headers.queue, async (m) => {
      if (!m) return;

      const h = m.properties.headers as IStreamHeader | undefined;

      if (!h || m.properties.correlationId !== headers.id) return;

      try { streamChannel?.ack(m); } catch {}

      if (m.content.byteLength) readable.push(m.content);

      if (h.final) {
        if (h.error) readable.destroy(new Error(h.error));
        else readable.push(null);
        await cleanup();
      }
    }, { noAck: false });
  })().catch(async (e) => {
    await cleanup();

    readable.destroy(e as Error);
  });

  return readable;
}

function sendStream(queue: string, message: Buffer, properties?: amqp.Options.Publish, options?: ISendMessageOptions): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();

      const q = await channel.assertQueue('', {
        durable: true,
        autoDelete: true,
        expires: (isNumeric(options?.timeout) ? +(options!.timeout as number) : (config.timeout || 30)) * 1000
      });

      const id = uuid();
      const length = Math.ceil(message.byteLength / (config.messageMaxSize as number));

      for (let index = 0; index < length; index++) {
        const part = index * (config.messageMaxSize as number);
        const headers: IStreamHeader = {
          id,
          queue: q.queue,
          index,
          length
        };

        channel.sendToQueue((index === 0 ? queue : q.queue), message.subarray(part, part + (config.messageMaxSize as number)), {
          ...(index === 0 ? properties : {
            correlationId: id
          }),
          headers
        });
      }

      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function receiveMessage(queue: string, callback?: Function): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();

      queue = `${config.namespace}${queue}`;

      await channel.assertQueue(queue, {
        durable: true
      });

      await channel.consume(queue, async (message) => {
        if (!message) return;

        try {
          message.content = await receiveStream(message);

          let params: any = message.content?.toString();

          try {
            params = JSON.parse(params);
          } catch (e) {
            logError('RabbitMQ JSON parse error', e as Error, null, true).catch(() => {});
          }

          if (callback && isFunction(callback)) {
            const { events, ...result } = await callback(params);

            if (message.properties?.replyTo) {
              const correlationId = message.properties?.correlationId;

              // streaming reply: payload itself is a Readable — pipe it straight into the chunk protocol
              if (result.payload && isFunction((result.payload as Readable).pipe)) {
                await sendReadableStream(message.properties.replyTo, result.payload as Readable, {
                  replyTo: message.properties.replyTo,
                  correlationId,
                  persistent: true
                });

                return;
              }

              // return message as buffer
              const returnMessage = Buffer.from(JSON.stringify({ data: result }));

              if (returnMessage.byteLength > (config.messageMaxSize as number)) {
                await sendStream(message.properties.replyTo, returnMessage, {
                  replyTo: message.properties.replyTo,
                  correlationId,
                  persistent: true
                });
              } else {
                channel.sendToQueue(message.properties.replyTo, returnMessage, {
                  correlationId,
                  persistent: true
                });
              }
            }
          }
        } catch (e) {
          logError('RabbitMQ message handler error', e as Error, null, true).catch(() => {});
        } finally {
          // ack after the handler settles so prefetch bounds in-flight work;
          // ack on error too — no dead-letter setup, requeueing would loop
          try { channel.ack(message); } catch {}
        }
      }, {
        noAck: false
      });

      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function sendMessage(name: string, data?: any, options?: ISendMessageOptions): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();

      let queue = name, pattern: string | null = null;

      if (queue.lastIndexOf('.') > -1) {
        pattern = queue.substring(queue.indexOf('.') + 1);
        queue = queue.substring(0, queue.indexOf('.'));
      }

      queue = `${config.namespace}${queue}`;

      await channel.assertQueue(queue, {
        durable: true
      });

      const message = Buffer.from(JSON.stringify({ pattern, data }));

      if (message.byteLength > (config.messageMaxSize as number)) {
        await sendStream(queue, message, undefined, options);
      } else {
        channel.sendToQueue(queue, message);
      }

      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function sendMessageForReply(name: string, data?: any, callback?: Function, options?: ISendMessageOptions): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const correlationId = uuid();

    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const settle = () => {
      if (settled) return false;

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      delete replyWaiters[correlationId];

      return true;
    };

    const fail = (error: Error) => {
      if (!settle()) return;

      if (callback && isFunction(callback)) {
        callback(error);
      }

      reject(error);
    };

    try {
      const { channel } = await connect();

      const expires = (isNumeric(options?.timeout) ? +(options!.timeout as number) : (config.timeout || 60)) * 1000;

      // the reply consumer has to exist before the request goes out
      await ensureReplyConsumer(channel);

      timer = setTimeout(() => {
        fail(new AppError(`No response from service (${name})`, 'NO_RESPONSE_FROM_SERVICE', {
          name
        }));
      }, expires);

      replyWaiters[correlationId] = {
        onError: fail,
        onReply: async (message) => {
          if (!settle()) return;

          try {
            message.content = await receiveStream(message);
          } catch (e) {
            // chunked reply could not be assembled; fail the call instead of
            // leaving the caller hanging
            const error = new AppError((e as Error)?.message || `Reply not received (${name})`, (e as any)?.code || 'STREAM_CHUNKS_LOST', {
              name
            });

            if (callback && isFunction(callback)) {
              callback(error);
            }

            reject(error);

            return;
          }

          let content: any = message.content?.toString?.();

          try {
            content = JSON.parse(content);
          } catch (e) {
            logError('RabbitMQ JSON parse error', e as Error, null, true).catch(() => {});
          }

          if (callback && isFunction(callback)) {
            callback(content?.data?.error || null, content?.data?.payload);
          }

          resolve(content?.data);
        }
      };

      const { queue, pattern } = parseTarget(name);

      const message = Buffer.from(JSON.stringify({ pattern, data }));

      if (message.byteLength > (config.messageMaxSize as number)) {
        await sendStream(queue, message, {
          correlationId,
          replyTo: DIRECT_REPLY_TO
        }, options);
      } else {
        channel.sendToQueue(queue, message, {
          correlationId,
          replyTo: DIRECT_REPLY_TO
        });
      }
    } catch (e) {
      fail(e as Error);
    }
  });
}

export function sendMessageForReplyStream(name: string, data?: any, options?: ISendMessageOptions): Promise<Readable> {
  return new Promise(async (resolve, reject) => {
    const correlationId = uuid();

    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const settle = () => {
      if (settled) return false;

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      delete replyWaiters[correlationId];

      return true;
    };

    const fail = (error: Error) => {
      if (settle()) {
        reject(error);
      }
    };

    try {
      const { channel } = await connect();

      const expires = (isNumeric(options?.timeout) ? +(options!.timeout as number) : (config.timeout || 60)) * 1000;

      await ensureReplyConsumer(channel);

      timer = setTimeout(() => {
        fail(new AppError(`No response from service (${name})`, 'NO_RESPONSE_FROM_SERVICE', { name }));
      }, expires);

      replyWaiters[correlationId] = {
        onError: fail,
        onReply: async (message) => {
          if (!settle()) return;

          // only the first chunk lands here; subsequent chunks (if any) flow through a producer-owned queue
          const headers = message.properties?.headers as IStreamHeader | undefined;

          if (headers?.streaming) {
            // open-ended streaming reply — chunks arrive on headers.queue as they're produced
            resolve(receiveStreamAsReadable(message));
          } else if (headers && isNumber(headers.length) && headers.length > 0) {
            // buffered multi-chunk reply — assemble then wrap as Readable
            try {
              const buf = await receiveStream(message);

              resolve(Readable.from(buf));
            } catch (e) {
              reject(new AppError((e as Error)?.message || `Reply not received (${name})`, (e as any)?.code || 'STREAM_CHUNKS_LOST', {
                name
              }));
            }
          } else {
            // single small reply
            resolve(Readable.from(message.content));
          }
        }
      };

      const { queue, pattern } = parseTarget(name);

      const message = Buffer.from(JSON.stringify({ pattern, data }));

      if (message.byteLength > (config.messageMaxSize as number)) {
        await sendStream(queue, message, {
          correlationId,
          replyTo: DIRECT_REPLY_TO
        }, options);
      } else {
        channel.sendToQueue(queue, message, {
          correlationId,
          replyTo: DIRECT_REPLY_TO
        });
      }
    } catch (e) {
      fail(e as Error);
    }
  });
}

const publishedStreams: { [key: string]: Array<{ index: number, content: Buffer }> } = {};

export function receivePublishedMessage(exchange: string, key: string, callback?: Function): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();

      exchange = `${config.namespace}${exchange}`;

      await channel.assertExchange(exchange, 'fanout', {
        durable: false
      });

      const { queue } = await channel.assertQueue('', {
        exclusive: true
      });

      await channel.bindQueue(queue, exchange, '');

      await channel.consume(queue, async (message) => {
        if (message) {
          const headers = message.properties?.headers as IStreamHeader | undefined;

          if (headers && isNumber(headers.index)) {
            // stream content
            if (headers.index === 0) {
              publishedStreams[headers.id] = [];
            }

            // push first content
            publishedStreams[headers.id].push({ index: headers.index, content: message.content });

            if (publishedStreams[headers.id].length === headers.length) {
              let payload: any = Buffer.concat(publishedStreams[headers.id].sort((a: any, b: any) => a.index < b.index ? -1 : (a.index > b.index ? 1 : 0)).map((buffer: any) => buffer.content));

              try {
                payload = JSON.parse(payload);
              } catch (e) {
                logError('RabbitMQ JSON parse error', e as Error, null, true).catch(() => {});
              }

              if (callback && isFunction(callback) && ((key === '*') || (payload?.key === key))) {
                callback(key === '*' ? payload : payload?.data);
              }

              delete publishedStreams[headers.id];
            }
          } else {
            let payload: any = message.content?.toString?.();

            try {
              payload = JSON.parse(payload);
            } catch (e) {
              logError('RabbitMQ JSON parse error', e as Error, null, true).catch(() => {});
            }

            if (callback && isFunction(callback) && ((key === '*') || (payload?.key === key))) {
              callback(key === '*' ? payload : payload?.data);
            }
          }
        }
      }, {
        noAck: true
      });

      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function publishMessage(exchange: string, key: string, data?: any): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();

      exchange = `${config.namespace}${exchange}`;

      await channel.assertExchange(exchange, 'fanout', {
        durable: false
      });

      const message = Buffer.from(JSON.stringify({ key, data }));

      if (message.byteLength > (config.messageMaxSize as number)) {
        const id = uuid();
        const length = Math.ceil(message.byteLength / (config.messageMaxSize as number));

        for (let index = 0; index < length; index++) {
          const part = index * (config.messageMaxSize as number);
          const headers: IStreamHeader = { id, queue: exchange, index, length };

          channel.publish(exchange, '', message.subarray(part, part + (config.messageMaxSize as number)), {
            headers
          });
        }

      } else {
        channel.publish(exchange, '', message);
      }

      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function listen(showInfo: boolean = false): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();

      channel.on('close', () => {
        listen(true).catch(() => {});
      });

      // queue & exchange list
      const queues = (config.queues as string || '').split(',').map(queue => queue.trim()).filter(queue => queue.length);
      const exchanges = (config.exchanges as string || '').split(',').map(exchange => exchange.trim()).filter(exchange => exchange.length);

      for (const queue of queues) {
        receiveMessage(queue, (params: any) => {
          const name = `${queue}${isNonEmptyString(params?.pattern) ? `.${params.pattern}` : ''}`;

          if (!eventEmitter.hasListeners(name)) {
            return {
              error: new AppError(`No listener (${name}) found`, 'NO_LISTENER_FOUND', {
                name
              })
            };
          }

          return new Promise((resolve) => {
            eventEmitter.emit(name, params.data, (error: AppError, payload: any | Readable, events?: Record<string, Function>) => {
              resolve({ error, payload, events });
            });
          });
        }).catch(() => {});
      }

      for (const exchange of exchanges) {
        receivePublishedMessage(exchange, '*', ({ key, data }: any) => {
          eventEmitter.emit(`${exchange}.${key}`, data);
        }).catch(() => {});
      }

      if (showInfo) {
        logInfo(`RabbitMQ connection restored`, true).catch(() => {});
      }

      resolve();
    } catch (e) {
      setTimeout(() => {
        logInfo(`RabbitMQ trying to reconnect`, true).catch(() => {});

        listen(true).catch(() => {});
      }, 5000);

      reject(e);
    }
  });
}
