import { describe, expect, it } from 'vitest';
import { paging, toResult } from './data';
import { AppError } from './error';

describe('paging', () => {
  it('returns offset/limit/total with defaults', () => {
    expect(paging(100)).toEqual({ offset: 0, limit: 20, total: 100 });
  });

  it('clamps offset out of range to 0', () => {
    expect(paging(50, 100, 10)).toEqual({ offset: 0, limit: 10, total: 50 });
  });

  it('caps limit at 1000', () => {
    expect(paging(5000, 0, 5000)).toEqual({ offset: 0, limit: 1000, total: 5000 });
  });

  it('coerces non-numeric inputs', () => {
    expect(paging(50, 'foo' as any, 'bar' as any)).toEqual({ offset: 0, limit: 20, total: 50 });
  });
});

describe('toResult', () => {
  it('wraps payload as success', () => {
    expect(toResult(undefined, { hello: 'world' })).toEqual({ success: true, payload: { hello: 'world' } });
  });

  it('passes through AppError as failure', () => {
    const err = new AppError('oops', 'X');
    expect(toResult(err)).toEqual({ success: false, error: err });
  });

  it('wraps a plain Error in AppError', () => {
    const result = toResult(new Error('boom'));
    expect(result).toBeInstanceOf(AppError);
  });
});
