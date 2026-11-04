import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type DataError,
  EmailBelongsToExistingAccountError,
  EmailTakenError,
  GoogleAlreadyLinkedError,
  InvalidInputError,
  InvalidReferenceError,
  InvalidTokenError,
  LastLoginMethodError,
  NotFoundError,
  RefreshTokenReuseError,
  UnderMinimumAgeError,
  UsernameTakenError,
} from '../errors';
import { asType } from '../internal/expressions';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { emailHash, encryptDate, encryptEmail } from '../internal/crypto';
import { KYSELY } from '../internal/kysely';
import { assertIdentityNotBanned, findActiveBan } from '../internal/sanctions';
import { tokenHash } from '../internal/token-hash';
import { isAtLeastAge, isLocalDate, parisToday } from '../internal/time';
import type {
  AccountTokenPurpose,
  CreateAccountTokenInput,
  CreateUserWithGoogleInput,
  CreateUserWithPasswordInput,
  IssueRefreshTokenInput,
  LoginInfo,
  RotateRefreshTokenInput,
} from '../types/account.types';

/** Minimum age on the creation date, Europe/Paris (BR-ACC-03). */
const MINIMUM_AGE = 15;

/** Creation constraints of a password account. */
const PASSWORD_ACCOUNT_CONSTRAINTS: Record<string, () => DataError> = {
  uq_user_account_username: () => new UsernameTakenError(),
  uq_user_account_email_hash: () => new EmailTakenError(),
  fk_user_account_municipality_id: () =>
    new InvalidReferenceError('Unknown municipality'),
};

/** Creation constraints of a Google account. BR-ACC-06: an existing email is refused, never merged. */
const GOOGLE_ACCOUNT_CONSTRAINTS: Record<string, () => DataError> = {
  uq_user_account_username: () => new UsernameTakenError(),
  uq_user_account_email_hash: () => new EmailBelongsToExistingAccountError(),
  fk_user_account_municipality_id: () =>
    new InvalidReferenceError('Unknown municipality'),
  uq_auth_identity_provider_subject: () => new GoogleAlreadyLinkedError(),
};

/** Constraints of linking a Google identity to an existing account. */
const GOOGLE_LINK_CONSTRAINTS: Record<string, () => DataError> = {
  uq_auth_identity_provider_subject: () => new GoogleAlreadyLinkedError(),
  uq_auth_identity_user_provider: () => new GoogleAlreadyLinkedError(),
  fk_auth_identity_user_id: () => new NotFoundError('User not found'),
};

/** Throws `InvalidInputError` for a malformed birth date and `UnderMinimumAgeError` for a user under 15 (BR-ACC-03). */
function assertMinimumAge(birthDate: string): void {
  if (!isLocalDate(birthDate)) {
    throw new InvalidInputError('Birth date must be YYYY-MM-DD');
  }
  // BR-ACC-03: the minimum age is checked on today's date in Europe/Paris, from the plain input.
  if (!isAtLeastAge(birthDate, MINIMUM_AGE, parisToday())) {
    throw new UnderMinimumAgeError();
  }
}

/**
 * Authentication data: accounts created with a password or Google, login lookup, Google identities,
 * refresh tokens (hashed, rotated, grouped by family) and single-use account tokens (BR-ACC-03 to BR-ACC-07, BR-TECH-11).
 * Methods take raw tokens: the data layer hashes them with SHA-256. Passwords arrive already hashed with argon2id.
 * Who may call these methods is decided by the developers' authentication code (Passport, JWT, Google OAuth).
 */
@Injectable()
export class AuthRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Creates an account with an email and password, its password identity and default settings, in one transaction.
   *
   * Rules: BR-ACC-01 (required fields), BR-ACC-02 (username unique, case-insensitive), BR-ACC-03 (minimum age 15 in
   * Europe/Paris), BR-ACC-04 (email and birth date encrypted, email blind index), BR-ACC-05 (password identity),
   * BR-ACC-13 (municipality), BR-ACC-15 (default settings).
   * Errors: `UnderMinimumAgeError`; `UsernameTakenError`; `EmailTakenError`; `InvalidReferenceError` (unknown
   * municipality); `InvalidInputError` (malformed birth date); `IdentityBannedError` (banned email, BR-MOD-04).
   * Outcome: the new user id.
   */
  async createUserWithPassword(
    input: CreateUserWithPasswordInput,
  ): Promise<{ userId: string }> {
    assertMinimumAge(input.birthDate);
    try {
      return await this.db.transaction().execute(async (trx) => {
        // BR-MOD-04: a banned email cannot sign up again.
        await assertIdentityNotBanned(trx, { email: input.email });
        const user = await trx
          .insertInto('user_account')
          .values({
            username: input.username,
            email_ciphertext: asType<Buffer>(encryptEmail(input.email)),
            email_hash: asType<Buffer>(emailHash(input.email)),
            first_name: input.firstName,
            birth_date_ciphertext: asType<Buffer>(encryptDate(input.birthDate)),
            municipality_id: input.municipalityId,
            gender: input.gender ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('auth_identity')
          .values({
            user_id: user.id,
            provider: 'password',
            password_hash: input.passwordHash,
          })
          .execute();
        await trx
          .insertInto('user_setting')
          .values({ user_id: user.id })
          .execute();

        return { userId: user.id };
      });
    } catch (err) {
      throw mapDbError(err, PASSWORD_ACCOUNT_CONSTRAINTS);
    }
  }

  /**
   * Creates an account from a Google identity, with its settings, in one transaction.
   * The email is not merged with an existing account (BR-ACC-06).
   *
   * Rules: BR-ACC-01, BR-ACC-02, BR-ACC-03, BR-ACC-04, BR-ACC-05 (one identity per Google subject), BR-ACC-06.
   * Errors: `UnderMinimumAgeError`; `EmailBelongsToExistingAccountError` (the email already has an account);
   * `UsernameTakenError`; `GoogleAlreadyLinkedError`; `InvalidReferenceError` (unknown municipality);
   * `IdentityBannedError` (banned email or Google identity, BR-MOD-04).
   * Outcome: the new user id. `email_verified_at` is set to now() when `emailVerified` is true.
   */
  async createUserWithGoogle(
    input: CreateUserWithGoogleInput,
  ): Promise<{ userId: string }> {
    assertMinimumAge(input.birthDate);
    try {
      return await this.db.transaction().execute(async (trx) => {
        // BR-MOD-04: a banned email or Google identity cannot sign up again.
        await assertIdentityNotBanned(trx, {
          email: input.email,
          googleSubject: input.googleSubject,
        });
        const user = await trx
          .insertInto('user_account')
          .values({
            username: input.username,
            email_ciphertext: asType<Buffer>(encryptEmail(input.email)),
            email_hash: asType<Buffer>(emailHash(input.email)),
            email_verified_at: input.emailVerified ? sql<Date>`now()` : null,
            first_name: input.firstName,
            birth_date_ciphertext: asType<Buffer>(encryptDate(input.birthDate)),
            municipality_id: input.municipalityId,
            gender: input.gender ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('auth_identity')
          .values({
            user_id: user.id,
            provider: 'google',
            provider_subject: input.googleSubject,
          })
          .execute();
        await trx
          .insertInto('user_setting')
          .values({ user_id: user.id })
          .execute();

        return { userId: user.id };
      });
    } catch (err) {
      throw mapDbError(err, GOOGLE_ACCOUNT_CONSTRAINTS);
    }
  }

  /**
   * Finds the login data of the account that uses this email (case-insensitive lookup on the blind index).
   *
   * Rules: BR-ACC-04, BR-ACC-07.
   * Errors: none expected.
   * Outcome: the login data (with the password hash, or `null` for a Google-only account, and the ban in force or
   * `null`), or `null` when no account matches. Refuse the login when `activeBan` is set (BR-MOD-03).
   * Note: returns `passwordHash`, which is allowed here only for authentication.
   */
  async findLoginByEmail(email: string): Promise<LoginInfo | null> {
    try {
      const row = await this.db
        .selectFrom('user_account as u')
        .leftJoin('auth_identity as ai', (join) =>
          join
            .onRef('ai.user_id', '=', 'u.id')
            .on('ai.provider', '=', 'password'),
        )
        .where('u.email_hash', '=', asType<Buffer>(emailHash(email)))
        .select([
          'u.id as user_id',
          'u.role',
          'u.email_verified_at',
          'u.deletion_requested_at',
          'ai.password_hash',
        ])
        .executeTakeFirst();
      if (row === undefined) {
        return null;
      }
      return {
        userId: row.user_id,
        passwordHash: row.password_hash ?? null,
        emailVerified: row.email_verified_at !== null,
        role: row.role,
        deletionRequestedAt: row.deletion_requested_at,
        // BR-MOD-03: the developers refuse the login while a ban is in force.
        activeBan: await findActiveBan(this.db, row.user_id),
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Finds the account linked to a Google subject.
   *
   * Rules: BR-ACC-05, BR-MOD-03.
   * Errors: none expected.
   * Outcome: the user id, role and ban in force (refuse the login when set), or `null` when no account is linked to
   * this subject.
   */
  async findUserByGoogleSubject(subject: string): Promise<{
    userId: string;
    role: LoginInfo['role'];
    activeBan: LoginInfo['activeBan'];
  } | null> {
    try {
      const row = await this.db
        .selectFrom('auth_identity as ai')
        .innerJoin('user_account as u', 'u.id', 'ai.user_id')
        .where('ai.provider', '=', 'google')
        .where('ai.provider_subject', '=', subject)
        .select(['u.id as user_id', 'u.role'])
        .executeTakeFirst();
      if (row === undefined) {
        return null;
      }
      return {
        userId: row.user_id,
        role: row.role,
        activeBan: await findActiveBan(this.db, row.user_id),
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Links a Google identity to an existing account.
   *
   * Rules: BR-ACC-05 (a Google subject is unique; one Google identity per account), BR-ACC-06 (no merging).
   * Errors: `GoogleAlreadyLinkedError` when the subject or the account already has a Google identity; `NotFoundError`;
   * `IdentityBannedError` (BR-MOD-04).
   * Outcome: nothing.
   */
  async linkGoogle(userId: string, googleSubject: string): Promise<void> {
    try {
      // BR-MOD-04: a banned Google identity cannot be linked.
      await assertIdentityNotBanned(this.db, { googleSubject });
      await this.db
        .insertInto('auth_identity')
        .values({
          user_id: userId,
          provider: 'google',
          provider_subject: googleSubject,
        })
        .execute();
    } catch (err) {
      throw mapDbError(err, GOOGLE_LINK_CONSTRAINTS);
    }
  }

  /**
   * Removes the Google identity of an account. The account row is locked so that two concurrent
   * removals cannot both pass the check.
   *
   * Rules: BR-ACC-05 (an account keeps at least one login method).
   * Errors: `LastLoginMethodError` when the Google identity is the only login method; `NotFoundError`.
   * Outcome: nothing. When the account has no Google identity, nothing changes.
   */
  async unlinkGoogle(userId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        const locked = await trx
          .selectFrom('user_account')
          .select('id')
          .where('id', '=', userId)
          .forUpdate()
          .executeTakeFirst();
        if (locked === undefined) {
          throw new NotFoundError('User not found');
        }

        const identities = await trx
          .selectFrom('auth_identity')
          .select(['id', 'provider'])
          .where('user_id', '=', userId)
          .execute();
        const google = identities.find(
          (identity) => identity.provider === 'google',
        );
        if (google === undefined) {
          return;
        }
        // BR-ACC-05: refuse when the Google identity is the only way to log in.
        if (identities.length === 1) {
          throw new LastLoginMethodError();
        }
        await trx
          .deleteFrom('auth_identity')
          .where('id', '=', google.id)
          .execute();
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Sets the password hash of an account, creating the password identity when it does not exist.
   *
   * Rules: BR-ACC-05, BR-TECH-11 (argon2id, computed by the developers).
   * Errors: `NotFoundError` when the account does not exist.
   * Outcome: nothing.
   */
  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    try {
      await this.db
        .insertInto('auth_identity')
        .values({
          user_id: userId,
          provider: 'password',
          password_hash: passwordHash,
        })
        .onConflict((oc) =>
          oc
            .columns(['user_id', 'provider'])
            .doUpdateSet({ password_hash: passwordHash }),
        )
        .execute();
    } catch (err) {
      throw mapDbError(err, {
        fk_auth_identity_user_id: () => new NotFoundError('User not found'),
      });
    }
  }

  /**
   * Stores a new refresh token (hashed). A new rotation family is created unless `familyId` is given.
   *
   * Rules: BR-ACC-07, BR-TECH-11.
   * Errors: `NotFoundError` when the account does not exist.
   * Outcome: the family id of the token.
   */
  async issueRefreshToken(
    input: IssueRefreshTokenInput,
  ): Promise<{ familyId: string }> {
    try {
      const row = await this.db
        .insertInto('refresh_token')
        .values({
          user_id: input.userId,
          family_id: input.familyId ?? sql<string>`uuidv7()`,
          token_hash: tokenHash(input.token),
          user_agent: input.userAgent ?? null,
          issued_at: sql<Date>`now()`,
          expires_at: input.expiresAt,
        })
        .returning('family_id')
        .executeTakeFirstOrThrow();
      return { familyId: row.family_id };
    } catch (err) {
      throw mapDbError(err, {
        fk_refresh_token_user_id: () => new NotFoundError('User not found'),
      });
    }
  }

  /**
   * Rotates a refresh token: the old token is replaced by a new one of the same family.
   * If the old token was already rotated or revoked, the whole family is revoked (the revocation is committed),
   * then `RefreshTokenReuseError` is thrown. Unknown or expired tokens are refused without revoking anything.
   *
   * Rules: BR-ACC-07 (rotated on use, revocable), BR-TECH-11 (reuse detection by family).
   * Errors: `InvalidTokenError` (unknown or expired); `RefreshTokenReuseError` (reuse, family revoked).
   * Outcome: the user id and family id of the new token.
   */
  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<{ userId: string; familyId: string }> {
    try {
      const outcome = await this.db.transaction().execute(async (trx) => {
        const old = await trx
          .selectFrom('refresh_token')
          .select([
            'id',
            'user_id',
            'family_id',
            'revoked_at',
            'replaced_by_id',
            sql<boolean>`expires_at <= now()`.as('expired'),
          ])
          .where('token_hash', '=', tokenHash(input.oldToken))
          .forUpdate()
          .executeTakeFirst();

        if (old === undefined || old.expired) {
          throw new InvalidTokenError();
        }

        if (old.revoked_at !== null || old.replaced_by_id !== null) {
          // BR-TECH-11: a rotated or revoked token was presented again. Revoke the whole family.
          // Returned (not thrown) so that the transaction commits the revocation.
          await trx
            .updateTable('refresh_token')
            .set({ revoked_at: sql<Date>`now()` })
            .where('family_id', '=', old.family_id)
            .where('revoked_at', 'is', null)
            .execute();
          return { reused: true as const, familyId: old.family_id };
        }

        const created = await trx
          .insertInto('refresh_token')
          .values({
            user_id: old.user_id,
            family_id: old.family_id,
            token_hash: tokenHash(input.newToken),
            user_agent: input.userAgent ?? null,
            issued_at: sql<Date>`now()`,
            expires_at: input.expiresAt,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx
          .updateTable('refresh_token')
          .set({ revoked_at: sql<Date>`now()`, replaced_by_id: created.id })
          .where('id', '=', old.id)
          .execute();

        return {
          reused: false as const,
          userId: old.user_id,
          familyId: old.family_id,
        };
      });

      if (outcome.reused) {
        throw new RefreshTokenReuseError();
      }
      return { userId: outcome.userId, familyId: outcome.familyId };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Revokes one refresh token. Revoking an unknown or already revoked token does nothing.
   *
   * Rules: BR-ACC-07 (revocation one by one).
   * Errors: none expected.
   * Outcome: nothing.
   */
  async revokeRefreshToken(token: string): Promise<void> {
    try {
      await this.db
        .updateTable('refresh_token')
        .set({ revoked_at: sql<Date>`now()` })
        .where('token_hash', '=', tokenHash(token))
        .where('revoked_at', 'is', null)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Revokes every refresh token of an account (all devices).
   *
   * Rules: BR-ACC-07 (revocation for all devices).
   * Errors: none expected.
   * Outcome: nothing.
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    try {
      await this.db
        .updateTable('refresh_token')
        .set({ revoked_at: sql<Date>`now()` })
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Stores a single-use account token (email verification or password reset), hashed.
   *
   * Rules: BR-ACC-07.
   * Errors: `NotFoundError` when the account does not exist.
   * Outcome: nothing.
   */
  async createAccountToken(input: CreateAccountTokenInput): Promise<void> {
    try {
      await this.db
        .insertInto('account_token')
        .values({
          user_id: input.userId,
          purpose: input.purpose,
          token_hash: tokenHash(input.token),
          expires_at: input.expiresAt,
        })
        .execute();
    } catch (err) {
      throw mapDbError(err, {
        fk_account_token_user_id: () => new NotFoundError('User not found'),
      });
    }
  }

  /**
   * Consumes an account token: it must match the purpose, be unused and unexpired. The use is recorded in the
   * same statement, so a token can be consumed only once.
   *
   * Rules: BR-ACC-07.
   * Errors: `InvalidTokenError` (unknown, wrong purpose, expired or already used).
   * Outcome: the user id the token belongs to.
   */
  async consumeAccountToken(
    purpose: AccountTokenPurpose,
    token: string,
  ): Promise<{ userId: string }> {
    try {
      const row = await this.db
        .updateTable('account_token')
        .set({ used_at: sql<Date>`now()` })
        .where('token_hash', '=', tokenHash(token))
        .where('purpose', '=', purpose)
        .where('used_at', 'is', null)
        .where(sql<boolean>`expires_at > now()`)
        .returning('user_id')
        .executeTakeFirst();
      if (row === undefined) {
        throw new InvalidTokenError();
      }
      return { userId: row.user_id };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Marks the email of an account as verified. An existing verification date is kept.
   *
   * Rules: BR-ACC-07.
   * Errors: `NotFoundError` when the account does not exist.
   * Outcome: nothing.
   */
  async markEmailVerified(userId: string): Promise<void> {
    try {
      const result = await this.db
        .updateTable('user_account')
        .set({
          email_verified_at: sql<Date>`COALESCE(email_verified_at, now())`,
        })
        .where('id', '=', userId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        throw new NotFoundError('User not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }
}
