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

const processId = process.pid;
const connection: { [key: number]: amqp.ChannelModel | null } = {
  [processId]: null
};
const channel: { [key: number]: amqp.Channel | null } = {
  [processId]: null
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
  queues?: string;
  exchanges?: string;
};

function resolveRabbitOptions(options?: IRabbitOptions): IRabbitOptions {
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
    queues: options?.queues ?? process.env.RABBIT_QUEUES,
    exchanges: options?.exchanges ?? process.env.RABBIT_EXCHANGES
  };
}

export function checkRabbitConfig(options?: IRabbitOptions): IRabbitOptions {
  const opts = resolveRabbitOptions(options);

  if (!isNonEmptyString(opts.host)) {
    throwAppError('RabbitMQ host configuration not found', 'MISSING_RABBIT_HOST');
  }

  return opts;
}

let resolved: IRabbitOptions = resolveRabbitOptions();

const namespace = () => isNonEmptyString(resolved.namespace) ? `${resolved.namespace}/` : '';
const messageMaxSize = () => resolved.messageMaxSize as number;

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

export function connect(options?: IRabbitOptions): Promise<{ connection: amqp.ChannelModel, channel: amqp.Channel }> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!connection[processId]) {
        resolved = checkRabbitConfig(options);

        const conn = await amqp.connect(createURI(resolved));
        connection[processId] = conn;

        conn.on('error', e => {
          logError('RabbitMQ connection error', e, null, true).catch(() => {});
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
          logError('RabbitMQ channel error', e, null, true).catch(() => {});
        }).on('close', () => {
          logWarning('RabbitMQ channel closed', true).catch(() => {});

          // reset
          channel[processId] = null;
        });
      }

      resolve({
        connection: connection[processId]!,
        channel: channel[processId]!
      });
    } catch (e) {
      reject(new AppError((e as Error).message, 'RABBITMQ_ERROR'));
    }
  });
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

function queueExists(name: string): Promise<boolean> {
  return new Promise(async (resolve) => {
    try {
      const { connection } = await connect();

      const tmpChannel = await connection.createChannel();

      // Prevent the error from bubbling up and crashing the process
      tmpChannel.on('error', (err) => {
        // We expect a 404 if it doesn't exist
        if (err.message.includes('404')) return;
      });

      try {
        // { passive: true } tells RabbitMQ: "Don't create it, just tell me if it's there."
        await tmpChannel.checkQueue(name);
        await tmpChannel.close();

        resolve(true);
      } catch (e) {
        resolve(false);
      }
    } catch (e) {
      resolve(false);
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
        stream.push({ index: headers.index, content: message.content });

        await channel.consume(headers.queue, async (streamMessage) => {
          if (streamMessage && isUUID(headers.id) && (streamMessage.properties?.correlationId === headers.id) && isNumber(headers.index) && isNumber(headers.length) && (stream.length < headers.length)) {
            channel.ack(streamMessage);

            stream.push({ index: headers.index, content: streamMessage.content });

            if (stream.length === headers.length) {
              resolve(Buffer.concat(stream.sort((a: any, b: any) => a.index < b.index ? -1 : (a.index > b.index ? 1 : 0)).map((buffer: any) => buffer.content)));

              await channel.deleteQueue(headers.queue);
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
        expires: (isNumeric(options?.timeout) ? +(options!.timeout as number) : (resolved.timeout || 30)) * 1000
      });

      const headers: IStreamHeader = {
        id: v4(),
        queue: q.queue,
        index: 0,
        length: Math.ceil(message.byteLength / messageMaxSize())
      };

      while (headers.index < headers.length) {
        const part = headers.index * messageMaxSize();

        channel.sendToQueue((headers.index === 0 ? queue : q.queue), message.subarray(part, part + messageMaxSize()), {
          ...(headers.index === 0 ? properties : {
            correlationId: headers.id
          }),
          headers
        });

        headers.index++;
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

      queue = `${namespace()}${queue}`;

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

              if (!(await queueExists(message.properties.replyTo))) {
                if (isFunction(events?.onUndelivered)) {
                  events.onUndelivered(result);
                }
              } else {
                if (returnMessage.byteLength > messageMaxSize()) {
                  await sendStream(message.properties.replyTo, returnMessage, {
                    replyTo: message.properties.replyTo,
                    correlationId: message.properties?.correlationId,
                    persistent: true
                  });
                } else {
                  channel.sendToQueue(message.properties.replyTo, returnMessage, {
                    correlationId: message.properties?.correlationId,
                    persistent: true
                  });
                }
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

      queue = `${namespace()}${queue}`;

      await channel.assertQueue(queue, {
        durable: true
      });

      const message = Buffer.from(JSON.stringify({ pattern, data }));

      if (message.byteLength > messageMaxSize()) {
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

      const q = await channel.assertQueue('', {
        durable: true
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
      }, (isNumeric(options?.timeout) ? +(options!.timeout as number) : (resolved.timeout || 60)) * 1000);

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

      queue = `${namespace()}${queue}`;

      const message = Buffer.from(JSON.stringify({ pattern, data }));

      if (message.byteLength > messageMaxSize()) {
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

      exchange = `${namespace()}${exchange}`;

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

      exchange = `${namespace()}${exchange}`;

      await channel.assertExchange(exchange, 'fanout', {
        durable: false
      });

      const message = Buffer.from(JSON.stringify({ key, data }));

      if (message.byteLength > messageMaxSize()) {
        const headers: IStreamHeader = {
          id: v4(),
          queue: exchange,
          index: 0,
          length: Math.ceil(message.byteLength / messageMaxSize())
        };

        while (headers.index < headers.length) {
          const part = headers.index * messageMaxSize();

          channel.publish(exchange, '', message.subarray(part, part + messageMaxSize()), {
            headers
          });

          headers.index++;
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
      const queues = (resolved.queues as string || '').split(',').map(queue => queue.trim()).filter(queue => queue.length);
      const exchanges = (resolved.exchanges as string || '').split(',').map(exchange => exchange.trim()).filter(exchange => exchange.length);

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
