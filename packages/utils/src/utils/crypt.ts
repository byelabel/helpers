import { createHash as createSimpleHash, createHmac, randomBytes } from 'node:crypto';
import { isNonEmptyString, isNumber } from './validator';

export function createHash(str: string, algorithm: 'sha256' | 'md5' = 'sha256', secret?: string): string {
  if (!isNonEmptyString(secret)) {
    secret = process.env.TOKEN_SECRET || 'the world is mine';
  }

  const hash = (algorithm === 'md5' ? createSimpleHash('md5') : createHmac('sha256', secret as string));

  return hash.update(str).digest('hex').toString();
}

export function comparePassword(hash: string, password: string): boolean {
  return hash === createHash(password);
}

export function createRandomHash(length = 80): string {
  if (!isNumber(length) || length < 1) length = 80;

  return randomBytes(Math.floor(length / 2)).toString('hex');
}

export function createKey(length = 6): string {
  if (!isNumber(length) || length < 1 || length > 21) length = 6;

  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  return (Math.random() * (max - min) + min).toFixed(0);
}

export function createToken(length = 6, prefix = ''): string {
  if (!isNumber(length) || length < 1) length = 6;
  if (!isNonEmptyString(prefix)) prefix = '';

  // 0/1 dropped; ambiguous letters kept only in their distinct case (L not l, o not O)
  const numbers = '23456789';
  const lower = 'abcdefghijkmnpqrstuvwxyz'; // no l, no o
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no O
  const alphabet = numbers + lower + upper;

  let randomString = '';

  while (randomString.length < length) {
    randomString += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `${prefix}${randomString}`;
}

export function getRandomNumber(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min + 1) + min);
}

export { createSimpleHash };
