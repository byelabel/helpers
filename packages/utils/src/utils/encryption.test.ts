import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, getKey } from './encryption';

const KEY = getKey('correct-horse-battery-staple', 'salty-salt');

describe('encryption', () => {
  describe('getKey', () => {
    it('is deterministic for the same password + salt', () => {
      const a = getKey('pw', 'salt');
      const b = getKey('pw', 'salt');

      expect(Buffer.compare(a as Buffer, b as Buffer)).toBe(0);
    });

    it('differs when the salt differs', () => {
      const a = getKey('pw', 'salt-a') as Buffer;
      const b = getKey('pw', 'salt-b') as Buffer;

      expect(Buffer.compare(a, b)).not.toBe(0);
    });

    it('produces a 32-byte key', () => {
      expect((getKey('pw', 'salt') as Buffer).length).toBe(32);
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips an ASCII string', () => {
      const cipher = encrypt('hello world', KEY);

      expect(decrypt(cipher, KEY)).toBe('hello world');
    });

    it('round-trips an empty string', () => {
      const cipher = encrypt('', KEY);

      expect(decrypt(cipher, KEY)).toBe('');
    });

    it('round-trips multibyte UTF-8 content', () => {
      const text = 'şçğüöı — 你好 — 🎉';
      const cipher = encrypt(text, KEY);

      expect(decrypt(cipher, KEY)).toBe(text);
    });

    it('produces a different ciphertext each call thanks to a random IV', () => {
      const a = encrypt('same input', KEY);
      const b = encrypt('same input', KEY);

      expect(Buffer.compare(a, b)).not.toBe(0);
      expect(decrypt(a, KEY)).toBe('same input');
      expect(decrypt(b, KEY)).toBe('same input');
    });

    it('throws when decrypting with the wrong key', () => {
      const wrong = getKey('different', 'salt');
      const cipher = encrypt('secret', KEY);

      expect(() => decrypt(cipher, wrong)).toThrow();
    });

    it('throws when the ciphertext has been tampered with', () => {
      const cipher = encrypt('secret', KEY);
      const tampered = Buffer.from(cipher);
      // flip a byte in the encrypted payload (after the 12-byte IV)
      tampered[14] = tampered[14] ^ 0x01;

      expect(() => decrypt(tampered, KEY)).toThrow();
    });

    it('throws when the auth tag has been tampered with', () => {
      const cipher = encrypt('secret', KEY);
      const tampered = Buffer.from(cipher);
      tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;

      expect(() => decrypt(tampered, KEY)).toThrow();
    });
  });
});