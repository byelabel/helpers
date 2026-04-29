import amqp from 'amqplib';
import process from 'node:process';
import { v4 } from 'uuid';
import { AppError, throwAppError } from './error';
import eventEmitter from './events';
import { logError, logInfo, logWarning } from './log';
import { isFunction, isNonEmptyString, isNumber, isNumeric, isUUID } from './validator';

type IStreamHeader = {
  id: string,
  queue: string,
  index: number,
  length: number
};

type IStream = {
  index: number,
  content: Buffer
};

type ISendMessageOptions = {
  timeout?: number
};

export type IRabbitOptions = {
  protocol?: string;
  host?: string;
  port?: number | string;
  user?: string;
  pass?: string;
  vhost?: string;
  namespace?: string;
  messageMaxSize?: number;
  timeout?: number;
  heartbeat?: number;
  queues?: string;
  exchanges?: string;
  maxRetries?: number;
  retryDelay?: number;
  retryMaxDelay?: number;
  keepAlive?: boolean;
  keepAliveDelay?: number;
};

type IPendingReply = { onUndelivered: Function, result: any, returned: boolean };

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

const pendingReplies: { [correlationId: string]: IPendingReply } = {};

let config: IRabbitOptions = {};

function resolveRabbitConfig(options?: IRabbitOptions): IRabbitOptions {
  return {
    protocol: options?.protocol ?? process.env.RABBIT_PROTOCOL,
    host: options?.host ?? process.env.RABBIT_HOST,
    port: options?.port ?? process.env.RABBIT_PORT,
    user: options?.user ?? process.env.RABBIT_USER,
    pass: options?.pass ?? process.env.RABBIT_PASS,
    vhost: options?.vhost ?? process.env.RABBIT_VHOST,
    namespace: options?.namespace ?? process.env.RABBIT_NAMESPACE,
    messageMaxSize: options?.messageMaxSize ?? Number(process.env.RABBIT_MESSAGE_MAX_SIZE || 5000000),
    timeout: options?.timeout ?? Number(process.env.RABBIT_TIMEOUT || 0),
    heartbeat: options?.heartbeat ?? Number(process.env.RABBIT_HEARTBEAT || 60),
    queues: options?.queues ?? process.env.RABBIT_QUEUES,
    exchanges: options?.exchanges ?? process.env.RABBIT_EXCHANGES,
    maxRetries: options?.maxRetries ?? Number(process.env.RABBIT_MAX_RETRIES || 5),
    retryDelay: options?.retryDelay ?? Number(process.env.RABBIT_RETRY_DELAY || 500),
    retryMaxDelay: options?.retryMaxDelay ?? Number(process.env.RABBIT_RETRY_MAX_DELAY || 5000),
    keepAlive: options?.keepAlive ?? (process.env.RABBIT_KEEP_ALIVE !== 'false'),
    keepAliveDelay: options?.keepAliveDelay ?? Number(process.env.RABBIT_KEEP_ALIVE_DELAY || 10000)
  };
}

export function checkRabbitConfig(options?: IRabbitOptions): IRabbitOptions {
  const opts = resolveRabbitConfig(options);

  if (!isNonEmptyString(opts.host)) {
    throwAppError('RabbitMQ host configuration not found', 'MISSING_RABBIT_HOST');
  }

  return opts;
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

  return url.join('');
}

export function connect(options?: IRabbitOptions): Promise<{ connection: amqp.ChannelModel, channel: amqp.ConfirmChannel }> {
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

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!connection[processId]) {
          const conn = await amqp.connect(createURI(config), {
            heartbeat: config.heartbeat,
            keepAlive: config.keepAlive,
            keepAliveDelay: config.keepAliveDelay,
            clientProperties: {
              connection_name: `${(process.env.NAME || 'Microservice').toLowerCase().replace(/[^a-z0-9-_]/i, '-')}-${processId}`
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

          ch.on('error', e => {
            const code = (e as any)?.code;
            logError('RabbitMQ channel error', e, code ? { code } : null, true).catch(() => {});
          }).on('close', () => {
            logWarning('RabbitMQ channel closed', true).catch(() => {});

            // reset
            channel[processId] = null;

            // confirms won't fire on a dead channel; drop pending entries
            for (const id of Object.keys(pendingReplies)) {
              delete pendingReplies[id];
            }
          }).on('return', (msg) => {
            const id = msg.properties?.correlationId;

            if (id && pendingReplies[id]) {
              pendingReplies[id].returned = true;
            }
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

          logWarning(`RabbitMQ connect failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`, true).catch(() => {});

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

function receiveStream(message: amqp.Message): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const { channel } = await connect();
      const headers = message?.properties?.headers as IStreamHeader | undefined;

      if (headers && isNumber(headers.index) && (headers.index === 0)) {
        // stream content
        const stream: IStream[] = [];

        // push first content
        stream.push({
          index: headers.index,
          content: message.content
        });

        const { consumerTag } = await channel.consume(headers.queue, async (streamMessage) => {
          if (!streamMessage) return;

          const streamHeaders = streamMessage.properties?.headers as IStreamHeader | undefined;

          if (streamHeaders && isUUID(headers.id) && (streamMessage.properties?.correlationId === headers.id) && isNumber(streamHeaders.index) && isNumber(headers.length) && (stream.length < headers.length)) {
            channel.ack(streamMessage);

            stream.push({
              index: streamHeaders.index,
              content: streamMessage.content
            });

            if (stream.length === headers.length) {
              resolve(Buffer.concat(stream.sort((a, b) => a.index - b.index).map(buffer => buffer.content)));

              await channel.cancel(consumerTag).catch(() => {});
              await channel.deleteQueue(headers.queue).catch(() => {});
            }
          }
        }, {
          noAck: false
        });
      } else {
        resolve(message.content);
      }
    } catch (e) {
      reject(e);
    }
  });
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

      const id = v4();
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
        if (message) {
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
              // return message as buffer
              const returnMessage = Buffer.from(JSON.stringify({ data: result }));
              const correlationId = message.properties?.correlationId;
              const onUndelivered = isFunction(events?.onUndelivered) ? events.onUndelivered : null;

              // Track this reply so the channel-level 'return' listener can flag it as undeliverable.
              // Cleanup happens in finalize() (after the publisher confirms) or when the channel closes.
              if (correlationId && onUndelivered) {
                pendingReplies[correlationId] = { onUndelivered, result, returned: false };
              }

              const finalize = () => {
                if (!correlationId) return;

                const entry = pendingReplies[correlationId];

                if (entry?.returned && isFunction(entry.onUndelivered)) {
                  entry.onUndelivered(entry.result);
                }

                delete pendingReplies[correlationId];
              };

              if (returnMessage.byteLength > (config.messageMaxSize as number)) {
                await sendStream(message.properties.replyTo, returnMessage, {
                  replyTo: message.properties.replyTo,
                  correlationId,
                  persistent: true,
                  mandatory: true
                });

                // For streams, mandatory only applies to chunk 0 (which carries `properties`).
                // waitForConfirms drains pending publishes so any 'return' has fired by now.
                await channel.waitForConfirms().catch(() => {});

                finalize();
              } else {
                channel.sendToQueue(message.properties.replyTo, returnMessage, {
                  correlationId,
                  persistent: true,
                  mandatory: true
                }, () => {
                  finalize();
                });
              }
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
    try {
      const { channel } = await connect();

      const timeoutMs = (isNumeric(options?.timeout) ? +(options!.timeout as number) : (config.timeout || 60)) * 1000;

      // Reply queues should not outlive the caller. exclusive: dies with the connection,
      // autoDelete: dies when the consumer detaches, expires: broker-side TTL backstop.
      const q = await channel.assertQueue('', {
        durable: false,
        exclusive: true,
        autoDelete: true,
        expires: timeoutMs
      });

      const timer = setTimeout(async () => {
        await channel.deleteQueue(q.queue);

        const error = new AppError(`No response from service (${name})`, 'NO_RESPONSE_FROM_SERVICE', {
          name
        });

        if (callback && isFunction(callback)) {
          callback(error);
        }

        reject(error);
      }, timeoutMs);

      // check to compare incoming message
      const correlationId = v4();

      await channel.consume(q.queue, async (message) => {
        if (message && (message.properties?.correlationId === correlationId)) {
          clearTimeout(timer);
          channel.ack(message);

          await channel.deleteQueue(q.queue);

          message.content = await receiveStream(message);

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
      }, {
        noAck: false
      });

      let queue = name, pattern: string | null = null;

      if (queue.lastIndexOf('.') > -1) {
        pattern = queue.substring(queue.indexOf('.') + 1);
        queue = queue.substring(0, queue.indexOf('.'));
      }

      queue = `${config.namespace}${queue}`;

      const message = Buffer.from(JSON.stringify({ pattern, data }));

      if (message.byteLength > (config.messageMaxSize as number)) {
        await sendStream(queue, message, {
          correlationId,
          replyTo: q.queue
        }, options);
      } else {
        channel.sendToQueue(queue, message, {
          correlationId,
          replyTo: q.queue
        });
      }
    } catch (e) {
      if (callback && isFunction(callback)) {
        callback(e);
      }

      reject(e);
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
        const id = v4();
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
            eventEmitter.emit(name, params.data, (error: AppError, payload: any, events?: Record<string, Function>) => {
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
