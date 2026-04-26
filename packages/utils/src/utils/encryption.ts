import { CipherKey, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = {
  BLOCK_CIPHER: 'aes-256-gcm',
  AUTH_TAG_BYTE_LEN: 16,
  IV_BYTE_LEN: 12,
  KEY_BYTE_LEN: 32,
  SALT_BYTE_LEN: 16
};

function getIV() {
  return randomBytes(ALGORITHM.IV_BYTE_LEN);
}

export function getKey(password: string, salt: string): CipherKey {
  return scryptSync(password, salt, ALGORITHM.KEY_BYTE_LEN) as CipherKey;
}

export function encrypt(clearText: string, key: CipherKey): Buffer {
  const iv = getIV();
  const cipher = createCipheriv(ALGORITHM.BLOCK_CIPHER, key, iv, {
    // @ts-ignore
    authTagLength: ALGORITHM.AUTH_TAG_BYTE_LEN
  });

  // @ts-ignore
  const encryptedMessage = Buffer.concat([cipher.update(clearText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return IV, encrypted message, and auth tag in a single buffer
  // @ts-ignore
  return Buffer.concat([iv, encryptedMessage, authTag], iv.length + encryptedMessage.length + authTag.length);
}

export function decrypt(encryptedText: Buffer, key: CipherKey): string {
  const authTag = encryptedText.subarray(-ALGORITHM.AUTH_TAG_BYTE_LEN);
  const iv = encryptedText.subarray(0, ALGORITHM.IV_BYTE_LEN);
  const cipherText = encryptedText.subarray(ALGORITHM.IV_BYTE_LEN, -ALGORITHM.AUTH_TAG_BYTE_LEN);

  const decipher = createDecipheriv(ALGORITHM.BLOCK_CIPHER, key, iv, {
    // @ts-ignore
    authTagLength: ALGORITHM.AUTH_TAG_BYTE_LEN
  });

  // @ts-ignore
  decipher.setAuthTag(authTag);
  // @ts-ignore
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);

  return decrypted.toString('utf8');
}
