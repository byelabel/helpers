import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { comparePassword, createHash, createKey, createRandomHash, createToken, getRandomNumber } from './crypt';

describe('crypt', () => {
  const originalSecret = process.env.TOKEN_SECRET;

  beforeEach(() => {
    delete process.env.TOKEN_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TOKEN_SECRET;
    } else {
      process.env.TOKEN_SECRET = originalSecret;
    }
  });

  describe('createHash', () => {
    it('is deterministic for the same input + secret', () => {
      expect(createHash('hello', 'sha256', 's')).toBe(createHash('hello', 'sha256', 's'));
    });

    it('changes with the secret', () => {
      expect(createHash('hello', 'sha256', 'a')).not.toBe(createHash('hello', 'sha256', 'b'));
    });

    it('produces a 64-char hex sha256 by default', () => {
      const out = createHash('hello', 'sha256', 'secret');

      expect(out).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces a 32-char hex md5 when requested', () => {
      const out = createHash('hello', 'md5');

      expect(out).toMatch(/^[0-9a-f]{32}$/);
    });

    it('md5 ignores the secret', () => {
      expect(createHash('hello', 'md5', 'a')).toBe(createHash('hello', 'md5', 'b'));
    });

    it('falls back to TOKEN_SECRET env when secret is not provided', () => {
      process.env.TOKEN_SECRET = 'env-secret';
      const fromEnv = createHash('hello');
      const explicit = createHash('hello', 'sha256', 'env-secret');

      expect(fromEnv).toBe(explicit);
    });

    it('falls back to the built-in default when no secret and no env', () => {
      const fromDefault = createHash('hello');
      const explicit = createHash('hello', 'sha256', 'the world is mine');

      expect(fromDefault).toBe(explicit);
    });
  });

  describe('comparePassword', () => {
    it('returns true when hash matches', () => {
      const hash = createHash('passw0rd');

      expect(comparePassword(hash, 'passw0rd')).toBe(true);
    });

    it('returns false when password differs', () => {
      const hash = createHash('passw0rd');

      expect(comparePassword(hash, 'wrong')).toBe(false);
    });
  });

  describe('createRandomHash', () => {
    it('defaults to 80 hex chars', () => {
      const out = createRandomHash();

      expect(out).toMatch(/^[0-9a-f]{80}$/);
    });

    it('honours the requested length (rounded down to even)', () => {
      expect(createRandomHash(10)).toHaveLength(10);
      expect(createRandomHash(11)).toHaveLength(10);
    });

    it('produces different values across calls', () => {
      expect(createRandomHash()).not.toBe(createRandomHash());
    });
  });

  describe('createKey', () => {
    it('returns a numeric string of the requested length', () => {
      const out = createKey(6);

      expect(out).toHaveLength(6);
      expect(out).toMatch(/^\d{6}$/);
    });

    it('defaults to length 6', () => {
      expect(createKey()).toHaveLength(6);
    });
  });

  describe('createToken', () => {
    it('returns a token of the requested length', () => {
      expect(createToken(5)).toHaveLength(5);
      expect(createToken(20)).toHaveLength(20);
    });

    it('defaults to length 5', () => {
      expect(createToken()).toHaveLength(5);
    });

    it('uses uppercase alphanumeric characters', () => {
      expect(createToken(50)).toMatch(/^[0-9A-Z]+$/);
    });
  });

  describe('getRandomNumber', () => {
    it('returns an integer within the inclusive bounds', () => {
      for (let i = 0; i < 200; i++) {
        const n = getRandomNumber(5, 10);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThanOrEqual(10);
      }
    });

    it('returns the bound when min === max', () => {
      expect(getRandomNumber(7, 7)).toBe(7);
    });
  });
});