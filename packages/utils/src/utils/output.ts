import { Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { v4 } from 'uuid';
import { createHash } from './crypt';
import { AppError, IAppError } from './error';
import { logError } from './log';
import { sendMessage } from './rabbit';
import { isFunction, isNonNullObject, isUndefined } from './validator';

export interface IRequest extends Request {
  me?: { id?: string } & Record<string, any>;
}

type ITransaction = {
  id: string,
  response_time: number
};

type IErrorData = {
  success: boolean,
  error: IAppError | Error,
  transaction?: ITransaction
};

type ISuccessData = {
  success: boolean,
  payload: any,
  transaction?: ITransaction
};

export type IResponseData = ISuccessData | IErrorData | IAppError;

export function responseData(error?: IAppError | Error | null, payload?: any, transaction?: ITransaction): IResponseData {
  if (error) {
    if (!(error instanceof AppError)) {
      return new AppError(error.message, 'SYSTEM_ERROR');
    }

    return {
      success: false,
      error,
      ...(isNonNullObject(transaction) ? { transaction } : {})
    };
  }

  return {
    success: true,
    payload,
    ...(isNonNullObject(transaction) ? { transaction } : {})
  };
}

export function toResponse(req: Request, res: Response, callback: Function, onError?: Function): void {
  if (isFunction(callback)) {
    const logs = (process.env.LOG || '').toString().split(',').map(s => s.trim()).filter(s => s.length);
    const transactionId = createHash(v4(), 'md5');
    const t0 = performance.now();
    const separator = '-';
    const service = (process.env.NAME || 'Microservice').toLowerCase().replace(/[^a-z0-9_]/g, separator).replace(new RegExp(`^${separator}+|${separator}+$|${separator}+(?=${separator})`, 'g'), '');

    if (logs.includes('request')) {
      sendMessage('log.event', {
        transaction_id: transactionId,
        user_id: (req as IRequest)?.me?.id,
        service,
        action: 'request',
        data: {
          method: req.method,
          url: req.originalUrl,
          ...(isNonNullObject(req.query) ? {
            query: req.query
          } : {}),
          ...(isNonNullObject(req.body) ? {
            body: req.body
          } : {})
        }
      }).catch(() => {});
    }

    callback(transactionId).then((payload: any = undefined) => {
      if (!isUndefined(payload)) {
        const data = responseData(null, payload, {
          id: transactionId,
          response_time: Number((performance.now() - t0).toFixed(3))
        });

        if (logs.includes('response')) {
          sendMessage('log.event', {
            transaction_id: transactionId,
            user_id: (req as IRequest)?.me?.id,
            service,
            action: 'response',
            data
          }).catch(() => {});
        }

        res.json(data);
      }
    }).catch((e: Error | AppError) => {
      if (!(e instanceof AppError)) {
        logError(`[${req.method}] ${req.originalUrl}`, e, {
          params: req.params,
          query: req.query,
          body: req.body
        }).catch(() => {});

        res.status(500);
      }

      const transaction = {
        id: transactionId,
        response_time: Number((performance.now() - t0).toFixed(3))
      };

      if (isFunction(onError)) {
        onError?.(e, transaction);
      } else {
        const data = responseData(e, null, transaction);

        if (logs.includes('response')) {
          sendMessage('log.event', {
            transaction_id: transactionId,
            user_id: (req as IRequest)?.me?.id,
            service,
            action: 'response',
            data
          }).catch(() => {});
        }

        res.json(data);
      }
    });
  } else {
    const message = 'Invalid content';

    res.status(405).format({
      html: function() {
        res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Error</title></head><body><h2>${message}</h2></body></html>`);
      },
      json: function() {
        res.json(new AppError(message));
      },
      default: function() {
        res.type('txt').send(message);
      }
    });
  }
}
