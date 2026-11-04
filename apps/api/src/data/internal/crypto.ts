import { type RawBuilder, sql } from 'kysely';
import { requiredEnv } from './env';

interface CryptoKeys {
  encryption: string;
  hmac: string;
}

let keys: CryptoKeys | undefined;

/** Keys are read from the environment once, on first use. They are only ever passed as query parameters. */
function cryptoKeys(): CryptoKeys {
  if (keys === undefined) {
    keys = {
      encryption: requiredEnv('DATA_ENCRYPTION_KEY'),
      hmac: requiredEnv('DATA_HMAC_KEY'),
    };
  }
  return keys;
}

/** Encrypts text with pgcrypto (`pgp_sym_encrypt`). Returns a bytea fragment. */
export function encryptText(value: string): RawBuilder<unknown> {
  return sql`pgp_sym_encrypt(${value}::text, ${cryptoKeys().encryption}::text)`;
}

/** Decrypts the bytea column `column` (e.g. `'users.email_ciphertext'`) with pgcrypto. Returns text. */
export function decryptText(column: string): RawBuilder<unknown> {
  return sql`pgp_sym_decrypt(${sql.ref(column)}, ${cryptoKeys().encryption}::text)`;
}

/** Canonical form of an email address used for storage and lookup. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Encrypts a normalized email address. */
export function encryptEmail(email: string): RawBuilder<unknown> {
  return encryptText(normalizeEmail(email));
}

/** HMAC-SHA256 of the normalized email address, used for unique lookups without decrypting. */
export function emailHash(email: string): RawBuilder<unknown> {
  return sql`hmac(${normalizeEmail(email)}::text, ${cryptoKeys().hmac}::text, 'sha256')`;
}

/** Encrypts a birth date given as 'YYYY-MM-DD'. */
export function encryptDate(date: string): RawBuilder<unknown> {
  return encryptText(date);
}

/** HMAC-SHA256 of an identity value used as is (for example a Google subject), for banned identities (BR-MOD-04). */
export function identityHash(value: string): RawBuilder<unknown> {
  return sql`hmac(${value}::text, ${cryptoKeys().hmac}::text, 'sha256')`;
}

/** Calls the database export function with the encryption key as a parameter, so emails and birth dates are decrypted (BR-GDP-07). */
export function exportUserDataSql(userId: string): RawBuilder<unknown> {
  return sql`export_user_data(${userId}::uuid, ${cryptoKeys().encryption}::text)`;
}
