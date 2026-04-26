import EventEmitter from 'eventemitter2';
import { sync } from 'glob';
import { existsSync, lstatSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AppError, throwAppError } from './error';
import { logError, logInfo, logWarning } from './log';
import { isFunction, isNonEmptyString } from './validator';

export type IEventResult = {
  error?: AppError | Error,
  payload?: any,
  events?: Record<string, Function>
};

const processId = process.pid;
const instance: { [key: number]: EventEmitter | null } = {
  [processId]: null
};

function eventEmitter() {
  if (!instance[processId]) {
    instance[processId] = new EventEmitter({
      wildcard: true,
      delimiter: '.',
      newListener: true,
      removeListener: true
    });
  }

  return instance[processId];
}

export default eventEmitter();

export async function attachEvents(path: string): Promise<void> {
  const eventsPath = resolve(path, 'events');

  if (existsSync(eventsPath)) {
    // get all js files as default
    let eventNames = await Promise.all(
      Array.from(sync(join(eventsPath, '**', '*.js'), { windowsPathsNoEscape: true }).values()).map(
        fileName => fileName.replace([eventsPath, sep].join(''), '').replace(/\.js$/, '').replace(new RegExp(`\\${sep}`, 'g'), '.')
      ).map(fileName => `${fileName.replace(/\.index$/, '')}.*`));

    if (process.env.EVENTS !== '*') {
      eventNames = (process.env.EVENTS || '').split(',').map(eventName => eventName.trim()).filter(eventName => isNonEmptyString(eventName));
    }

    for await (const eventName of eventNames) {
      try {
        let name = eventName, pattern = (process.env.EVENTS === '*') ? '*' : null;

        if (name.lastIndexOf('.') > -1) {
          pattern = name.substring(name.lastIndexOf('.') + 1);
          name = name.substring(0, name.lastIndexOf('.'));
        }

        let filePath = join(eventsPath, ...name.split('.'));

        if (existsSync(filePath) && lstatSync(filePath).isDirectory()) {
          filePath = join(filePath, 'index');
        }

        filePath = `${filePath}.js`;

        if (!existsSync(filePath)) {
          throwAppError(`Event file not found: ${name}`, 'FILE_NOT_FOUND', {
            name
          });
        }

        const file = require(filePath);
        const functions: any = {};

        if (pattern === '*') {
          for (const functionName of Object.keys(file)) {
            functions[functionName === 'default' ? name : `${name}.${functionName}`] = file[functionName];
          }
        } else if (isNonEmptyString(pattern)) {
          functions[name] = file[pattern as string];
        } else {
          functions[name] = file.default;
        }

        for (const functionName of Object.keys(functions)) {
          const callback = functions[functionName];

          if (isFunction(callback)) {
            eventEmitter().on(functionName, callback);

            logInfo(`Event attached: ${functionName}`).catch(() => {});
          } else {
            logWarning(`Callback function not defined: ${functionName}`).catch(() => {});
          }
        }
      } catch (e) {
        logError(`Event (${eventName}) Attach Error`, e as Error).catch(() => {});
      }
    }
  }
}

export function eventResult(name: string, fn: Function | undefined, callback: Function, events?: Record<string, Function>): Promise<IEventResult> {
  return new Promise(async (resolve) => {
    callback().then((payload: any) => {
      fn?.(null, payload, events);

      resolve({ payload, events });
    }).catch((error: Error | AppError) => {
      if (!(error instanceof AppError)) {
        error = new AppError(error.message, 'SYSTEM_ERROR');
      }

      logError(`Event: ${name}`, error).catch(() => {});

      fn?.(error, undefined, events);

      resolve({ error, events });
    });
  });
}
