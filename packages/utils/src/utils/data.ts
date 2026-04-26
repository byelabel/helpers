import { AppError, IAppError } from './error';
import { isNumeric } from './validator';

type ITotal = {
  all: number,
  filtered: number
};

export type IList<T> = {
  data: T[],
  offset: number,
  limit: number,
  total: ITotal
};

export type IInfiniteList<T> = {
  data: T[],
  limit?: number,
  more: boolean | number
};

type IErrorResult = {
  success: boolean,
  error: IAppError | Error
};

type ISuccessResult = {
  success: boolean,
  payload: any
};

export type IResult = ISuccessResult | IErrorResult | IAppError;

export function toResult(error?: IAppError | Error, payload?: any): IResult {
  if (error) {
    if (!(error instanceof AppError)) {
      return new AppError(error.message, 'SYSTEM_ERROR');
    }

    return {
      success: false,
      error
    };
  }

  return {
    success: true,
    payload
  };
}

export function paging(total: number = 0, offset: number = 0, limit: number = 20) {
  total = Number(total);
  offset = !isNumeric(offset) ? 0 : Number(offset);
  limit = !isNumeric(limit) ? 20 : Number(limit);

  if (offset < 0 || offset >= total) {
    offset = 0;
  }

  if (limit > 1000) {
    limit = 1000;
  }

  return {
    offset,
    limit,
    total
  };
}
