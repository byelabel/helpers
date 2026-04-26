import { URL } from 'node:url';
import { validate } from 'uuid';

export function isBuffer(value: any): boolean {
  return value instanceof Buffer;
}

export function isSymbol(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Symbol]';
}

export function isUndefined(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Undefined]';
}

export function isNull(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Null]';
}

export function isArray(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Array]';
}

export function isNonEmptyArray(value: any): boolean {
  return isArray(value) && (value.length > 0);
}

export function isBoolean(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Boolean]';
}

export function isNumber(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Number]';
}

export function isInteger(value: any): boolean {
  return isNumeric(value) && Number.isInteger(Number(value));
}

export function isNumeric(value: any): boolean {
  return isNumber(value) || (isNonEmptyString(value) && !isNaN(Number(value)));
}

export function isString(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object String]';
}

export function isNonEmptyString(value: any): boolean {
  return isString(value) && (value !== '');
}

export function isObject(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function isNonNullObject(value: any): boolean {
  return isObject(value) && (Object.keys(value).length !== 0);
}

export function isEmpty(value: any): boolean {
  return isNull(value)
    || isUndefined(value)
    || (isString(value) && (value === ''))
    || (isArray(value) && !isNonEmptyArray(value))
    || (isObject(value) && !isNonNullObject(value));
}

export function isNotEmpty(value: any): boolean {
  return !isEmpty(value);
}

export function isFunction(value: any): boolean {
  return (Object.prototype.toString.call(value) === '[object Function]') || isAsyncFunction(value);
}

export function isAsyncFunction(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object AsyncFunction]';
}

export function isUUID(value: any): boolean {
  return isString(value) && validate(value);
}

export function isEmail(value: any): boolean {
  return isNonEmptyString(value) && /^[^@]+@[^@]+$/.test(value);
}

export function isPhoneNumber(value: any): boolean {
  return isNonEmptyString(value) && /^(\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}(?:\s?(?:ext|ext\.|x|#)\s?(\d+))?$/i.test(value);
}

export function isURL(value: any): boolean {
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

  if (value.split('').reduce((n, i, index) => (index < 10 ? n + Number(i) : n), 0) % 10 !== Number(value.charAt(10))) return false;

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
