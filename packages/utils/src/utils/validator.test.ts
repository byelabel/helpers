import { describe, expect, it } from 'vitest';
import {
  isArray,
  isBoolean,
  isEmail,
  isInteger,
  isNonEmptyArray,
  isNonEmptyString,
  isNonNullObject,
  isNumber,
  isNumeric,
  isString,
  isUUID
} from './validator';

describe('validator', () => {
  it('isArray', () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1])).toBe(true);
    expect(isArray('a')).toBe(false);
    expect(isArray(null)).toBe(false);
  });

  it('isNonEmptyArray', () => {
    expect(isNonEmptyArray([])).toBe(false);
    expect(isNonEmptyArray([1])).toBe(true);
  });

  it('isBoolean', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('true')).toBe(false);
  });

  it('isNumber', () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(1.5)).toBe(true);
    expect(isNumber('1')).toBe(false);
  });

  it('isInteger', () => {
    expect(isInteger(1)).toBe(true);
    expect(isInteger('1')).toBe(true);
    expect(isInteger(1.5)).toBe(false);
  });

  it('isNumeric', () => {
    expect(isNumeric(0)).toBe(true);
    expect(isNumeric('42')).toBe(true);
    expect(isNumeric('abc')).toBe(false);
    expect(isNumeric('')).toBe(false);
  });

  it('isString / isNonEmptyString', () => {
    expect(isString('')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('hi')).toBe(true);
  });

  it('isNonNullObject', () => {
    expect(isNonNullObject({})).toBe(false);
    expect(isNonNullObject({ a: 1 })).toBe(true);
    expect(isNonNullObject(null)).toBe(false);
  });

  it('isEmail', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('not-email')).toBe(false);
  });

  it('isUUID', () => {
    expect(isUUID('00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(isUUID('abc')).toBe(false);
  });
});
