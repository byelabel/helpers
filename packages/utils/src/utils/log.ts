import { appendFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { AppError, getErrorString } from './error';
import { sendMessage } from './rabbit';
import { isEmail, isNonEmptyArray } from './validator';

export type IErrorType = 'error' | 'warning' | 'info' | 'request' | 'webservice' | 'event';

export function writeToFile(data: string, type: IErrorType = 'error'): {
  path: string,
  name: string,
  fullPath: string
} {
  const path: string = join(process.env.ROOT_PATH as string, (process.env.LOGS_PATH || 'logs'));

  if (!existsSync(path)) {
    mkdirSync(path, {
      recursive: true
    });
  }

  const name: string = `${new Date().toISOString().slice(0, 10)}-${type}.log`;
  const fullPath = [path, name].join('/');

  appendFileSync(
    fullPath,
    `${new Date().toISOString().slice(11, 19)} - ${data}\n`
  );

  return {
    path,
    name,
    fullPath
  };
}

export function logInfo(message: string, show: boolean = false): Promise<string> {
  return new Promise((resolve) => {
    writeToFile(message, 'info');

    if ((process.env.DEBUG === 'true') || show) {
      console.log(message);
    }

    resolve(message);
  });
}

export function logWarning(message: string, show: boolean = false): Promise<string> {
  return new Promise((resolve) => {
    writeToFile(message, 'warning');

    if ((process.env.DEBUG === 'true') || show) {
      console.log(message);
    }

    resolve(message);
  });
}

export function logError(name: string, error: Error, args?: any, show: boolean = false): Promise<string> {
  return new Promise(resolve => {
    let errorString = `${name} - ${getErrorString(error)}`;

    if (error instanceof AppError) {
      if (error.args) {
        errorString = `${errorString} (${JSON.stringify(error.args)})`;
      }

      writeToFile(errorString, 'error');

      if ((process.env.DEBUG === 'true') || show) {
        console.log(errorString);
      }

      return resolve(`App Error: ${errorString}`);
    }

    if (args) {
      errorString = `${errorString} (${JSON.stringify(args)})`;
    }

    try {
      const file = writeToFile(errorString, 'error');

      if ((process.env.SEND_LOGS === 'true') && isEmail(process.env.ADMIN_EMAIL)) {
        const lines: string[] = [];
        const rl = createInterface(createReadStream(file.fullPath));

        rl.on('line', line => {
          lines.push(line);
        }).on('close', async () => {
          if (lines.length % 10 === 0) {
            // HTML content
            let logs: string[] = [`<p>Error Log Latest Lines:</p>`];

            lines.slice(-10).map((line) => {
              logs.push(`<p>${line}</p>`);
            });

            sendMessage('message.send', {
              type: 'email',
              params: {
                recipients: {
                  to: ['admin']
                },
                message: {
                  subject: `${process.env.NAME || 'Microservice'}: Error Information`,
                  text: `${process.env.NAME || 'Microservice'}: ${logs.length} line${logs.length > 1 ? 's' : ''} of error occurred`,
                  html: `<ul>${logs.map(log => `<li>${log}</li>`)}</ul>`,
                  attachments: [{
                    name: file.name,
                    path: file.fullPath
                  }]
                },
                template: {
                  path: 'logs',
                  language: process.env.DEFAULT_LANGUAGE || 'en-US',
                  context: {
                    logs
                  }
                }
              }
            }).catch(() => {});
          }
        });
      }
    } finally {
      if ((process.env.DEBUG === 'true') || show) {
        console.log(errorString);
      }

      resolve(errorString);
    }
  });
}

export function showMessages(messages: string[]): void {
  if (isNonEmptyArray(messages)) {
    const maxLength = Math.max(...messages.map(message => message.length));

    console.info('='.repeat(maxLength));

    messages.forEach(message => {
      console.info(message);
    });

    console.info('='.repeat(maxLength));
  }
}
