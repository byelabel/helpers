import { URL } from 'node:url';

export function isBuffer(value: any): value is Buffer {
  return value instanceof Buffer;
}

export function isSymbol(value: any): value is symbol {
  return Object.prototype.toString.call(value) === '[object Symbol]';
}

export function isUndefined(value: any): value is undefined {
  return Object.prototype.toString.call(value) === '[object Undefined]';
}

export function isNull(value: any): value is null {
  return Object.prototype.toString.call(value) === '[object Null]';
}

export function isArray(value: any): value is any[] {
  return Object.prototype.toString.call(value) === '[object Array]';
}

export function isNonEmptyArray(value: any): value is any[] {
  return isArray(value) && value.length > 0;
}

export function isBoolean(value: any): value is boolean {
  return Object.prototype.toString.call(value) === '[object Boolean]';
}

export function isNumber(value: any): value is number {
  return Object.prototype.toString.call(value) === '[object Number]';
}

export function isInteger(value: any): boolean {
  return isNumeric(value) && Number.isInteger(Number(value));
}

export function isNumeric(value: any): boolean {
  return isNumber(value) || (isNonEmptyString(value) && !isNaN(Number(value)));
}

export function isString(value: any): value is string {
  return Object.prototype.toString.call(value) === '[object String]';
}

export function isNonEmptyString(value: any): value is string {
  return isString(value) && (value !== '');
}

export function isObject(value: any): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

// Unlike isObject, also true for class instances (errors, dates, arrays...).
export function isObjectLike(value: any): value is Record<string, any> {
  return (typeof value === 'object') && (value !== null);
}

export function isNonNullObject(value: any): value is Record<string, any> {
  return isObject(value) && Object.keys(value).length !== 0;
}

export function isEmpty(value: any): boolean {
  return (
    isNull(value) ||
    isUndefined(value) ||
    (isString(value) && value === '') ||
    (isArray(value) && !isNonEmptyArray(value)) ||
    (isObject(value) && !isNonNullObject(value))
  );
}

export function isNotEmpty(value: any): boolean {
  return !isEmpty(value);
}

export function isFunction(value: any): value is (...args: any[]) => any {
  return Object.prototype.toString.call(value) === '[object Function]' || isAsyncFunction(value);
}

export function isAsyncFunction(value: any): value is (...args: any[]) => Promise<any> {
  return Object.prototype.toString.call(value) === '[object AsyncFunction]';
}

export function isUUID(value: any): value is string {
  return (
    isNonEmptyString(value) &&
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i.test(
      value
    )
  );
}

export function isEmail(value: any): value is string {
  return isNonEmptyString(value) && /^[^@]+@[^@]+$/.test(value);
}

export function isPhoneNumber(value: any): value is string {
  return (
    isNonEmptyString(value) &&
    /^(\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}(?:\s?(?:ext|ext\.|x|#)\s?(\d+))?$/i.test(
      value,
    )
  );
}

export function isURL(value: any): value is string {
  if (!isNonEmptyString(value)) return false;

  try {
    const uri = new URL(value);
    const scheme = uri.protocol;

    if (!['http:', 'https:'].includes(scheme)) return false;
  } catch (e) {
    return false;
  }

  return true;
}

export function isTCNumber(value: number | string): boolean {
  if (!isNumeric(value)) return false;

  value = String(value);

  if (value.length !== 11) return false;

  if (Number(value.charAt(0)) === 0) return false;

  if (
    value.split('').reduce((n, i, index) => (index < 10 ? n + Number(i) : n), 0) % 10 !==
    Number(value.charAt(10))
  )
    return false;

  const odd = value.split('').reduce((n, i, index) => {
    if (index % 2 === 0 && index < 9) {
      n += Number(i);
    }

    return n;
  }, 0);

  const even = value.split('').reduce((n, i, index) => {
    if (index % 2 === 1 && index < 9) {
      n += Number(i);
    }

    return n;
  }, 0);

  return (odd * 7 - even) % 10 === Number(value.charAt(9));
}
