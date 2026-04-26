export interface IAppError extends Error {
  code: number | string;
  message: string;
  args?: any;
}

export interface IResponseError extends IAppError {
  status: number;
}

const separator = '_';
const defaultMessage = 'Unknown error';

if (!('toJSON' in Error.prototype)) {
  Object.defineProperty(Error.prototype, 'toJSON', {
    value: function() {
      const alt: any = {};

      Object.getOwnPropertyNames(this).forEach(function(this: any, key) {
        alt[key] = this[key];
      }, this);

      return alt;
    },
    configurable: true,
    writable: true
  });
}

/**
 * Application Error
 *
 * @class AppError
 */
export class AppError extends Error implements IAppError {
  code: number | string;
  args: any;

  constructor(message: string, code?: number | string, args?: any) {
    super(message || defaultMessage);
    Error.captureStackTrace(this, AppError);
    this.name = (<any>this).constructor.name;
    this.code = typeof code === 'string' && code.length
      ? code
      : (message || 'unknown').toString().trim().toUpperCase().replace(/[^A-Z\d]/g, separator).replace(new RegExp(`^${separator}+|${separator}+$|${separator}+(?=${separator})`, 'g'), '');
    this.args = args;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      args: this.args
    };
  }
}

/**
 * Response Error
 *
 * @class ResponseError
 */
export class ResponseError extends AppError implements IResponseError {
  status: number;

  constructor(message: string, status: number = 200) {
    super(message);
    Error.captureStackTrace(this, ResponseError);
    this.status = status;
  }

  toJSON() {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      args: this.args
    };
  }
}

export function throwAppError(message: string, code?: number | string, args?: any): void {
  throw new AppError(message, code, args);
}

export type IErrorOrigin = {
  file: string,
  line: number,
  column: number,
  func?: string | null
};

export function getErrorOrigin(error: Error): IErrorOrigin | null {
  const stack = error?.stack;

  if (!stack) return null;

  const lines = stack.split('\n');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/\((.*):(\d+):(\d+)\)$/) || line.match(/at\s+(.*):(\d+):(\d+)$/);

    if (!match) continue;

    const file = match[1];

    if (file.includes('node:') || file.includes('node_modules/')) continue;

    const funcMatch = line.match(/at\s+([^\s(]+)\s+\(/);

    return {
      file,
      line: Number(match[2]),
      column: Number(match[3]),
      func: funcMatch ? funcMatch[1] : null
    };
  }

  return null;
}

export function getErrorString(error: Error): string {
  const origin = getErrorOrigin(error);

  if (!origin || !origin.file) return '';

  const where = `${origin.file}:${origin.line}:${origin.column}`;

  return `${error?.message} - [${origin.func ? `${origin.func} @ ` : ''}${where}]`;
}
