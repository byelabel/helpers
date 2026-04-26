import { createHash as createSimpleHash, createHmac, randomBytes } from 'node:crypto';
import { isNonEmptyString } from './validator';

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
  return randomBytes(Math.floor(length / 2)).toString('hex');
}

export function createKey(length: number = 6): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  return (Math.random() * (max - min) + min).toFixed(0);
}

export function createToken(length: number = 5): string {
  let randomString = '';

  const createRandomString = () => Math.random().toString(36).replace('0.', '').toUpperCase();

  while (randomString.length < length) {
    randomString += createRandomString();
  }

  return randomString.substring(0, length);
}

export function getRandomNumber(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);

  return Math.floor(Math.random() * (max - min + 1) + min);
}

export { createSimpleHash };
